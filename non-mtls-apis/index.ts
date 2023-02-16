import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import {RecordType} from "@pulumi/aws/route53";

const config = new pulumi.Config();

const org = pulumi.getOrganization();
const project = pulumi.getProject();
const stack = pulumi.getStack();
const suffix = `-${project}-${stack}`;

const infraRef = new pulumi.StackReference(`${org}/mtls-infra/${stack}`);
const functionsRef = new pulumi.StackReference(`${org}/functions/${stack}`);

const HOSTED_ZONE_NAME = config.require("HOSTED_ZONE_NAME");
const API_DOMAIN = config.require("API_DOMAIN");

const apiZone = aws.route53.getZoneOutput({
    name: HOSTED_ZONE_NAME
});

const apiGatewayDomain = new aws.apigatewayv2.DomainName(API_DOMAIN, {
    domainName: infraRef.getOutput('apiDomain'),
    domainNameConfiguration: {
        endpointType: 'REGIONAL',
        securityPolicy: 'TLS_1_2',
        certificateArn: infraRef.getOutput('apiCertArn')
    }
});

const A_Record = new aws.route53.Record(`${API_DOMAIN}-A-record`, {
    type: RecordType.A,
    name: API_DOMAIN,
    zoneId: apiZone.zoneId,
    allowOverwrite: false,
    aliases: [{
        zoneId: apiGatewayDomain.domainNameConfiguration.hostedZoneId,
        name: apiGatewayDomain.domainNameConfiguration.targetDomainName,
        evaluateTargetHealth: false
    }]
});

const AAAA_Record = new aws.route53.Record(`${API_DOMAIN}-AAAA-record`, {
    type: RecordType.AAAA,
    name: API_DOMAIN,
    zoneId: apiZone.zoneId,
    allowOverwrite: false,
    aliases: [{
        zoneId: apiGatewayDomain.domainNameConfiguration.hostedZoneId,
        name: apiGatewayDomain.domainNameConfiguration.targetDomainName,
        evaluateTargetHealth: false
    }]
});

const pingApi = new aws.apigatewayv2.Api(`Ping-Api-Gateway${suffix}`, {
    protocolType: "HTTP",
    disableExecuteApiEndpoint: true, // important
    name: `Ping-API${suffix}`,
    description: 'An API to test the normal i.e. non-MTLS integration'
});

const pingLambdaPermission = new aws.lambda.Permission(`Lambda-Permission-Ping-Api${suffix}`, {
    action: "lambda:InvokeFunction",
    principal: "apigateway.amazonaws.com",
    function: functionsRef.getOutput('pingLambdaFunctionName'),
    sourceArn: pulumi.interpolate`${pingApi.executionArn}/*/*`,
}, {dependsOn: [pingApi]});

const pingIntegration = new aws.apigatewayv2.Integration(`Lambda-Integration-Ping-Api${suffix}`, {
    apiId: pingApi.id,
    integrationType: "AWS_PROXY",
    integrationUri: functionsRef.getOutput('pingLambdaFunctionArn'),
    integrationMethod: "GET",
    payloadFormatVersion: "2.0",
    passthroughBehavior: "WHEN_NO_MATCH",
    description: 'Integration between API gateway and the Ping lambda function, the normal scenario i.e. non-mtls'
});

const pingRoute = new aws.apigatewayv2.Route(`API-Route-Ping${suffix}`, {
    apiId: pingApi.id,
    routeKey: "GET /v1/ping",
    target: pulumi.interpolate`integrations/${pingIntegration.id}`
});

const stage = new aws.apigatewayv2.Stage(`API-Stage-Ping-Api${suffix}`, {
    apiId: pingApi.id,
    name: stack,
    autoDeploy: true,
    description: `${suffix} stage for the testing normal i.e. non-mtls`
}, {dependsOn: [pingRoute]});

new aws.apigatewayv2.ApiMapping(`API-Mapping-Ping-Api${suffix}`, {
    domainName: apiGatewayDomain.domainName,
    apiId: pingApi.id,
    stage: stage.id,
});

export const apiGatewayCustomDomainName = apiGatewayDomain.domainName;
export const DNS_AAAA_Record = AAAA_Record;
export const DNS_A_Record = A_Record;
