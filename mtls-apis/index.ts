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
const SUB_DOMAIN = config.require("SUB_DOMAIN");
const SUB_DOMAIN_MTLS = config.require("SUB_DOMAIN_MTLS");
const API_DOMAIN = config.require("API_DOMAIN");
const API_DOMAIN_MTLS = config.require("API_DOMAIN_MTLS");

const apiZone = aws.route53.getZoneOutput({
    name: HOSTED_ZONE_NAME
});

const apiGatewayDomainWithMTLS = new aws.apigatewayv2.DomainName(API_DOMAIN_MTLS, {
    domainName: infraRef.getOutput('apiDomainMtls'),
    domainNameConfiguration: {
        endpointType: 'REGIONAL',
        securityPolicy: 'TLS_1_2',
        certificateArn: infraRef.getOutput('apiCertArnMtls')
    },
    mutualTlsAuthentication: {
        // s3://mtls.neuw.api.ap-south-2.in-ts-bckt/ca.pem
        truststoreUri: pulumi.interpolate `s3://${infraRef.getOutput('truststoreBucketName')}/${infraRef.getOutput('truststoreObjectKey')}`
    }
});

const A_RecordWithMTLS = new aws.route53.Record(`${API_DOMAIN_MTLS}-A-record`, {
    type: RecordType.A,
    name: API_DOMAIN_MTLS,
    zoneId: apiZone.zoneId,
    allowOverwrite: false,
    aliases: [{
        zoneId: apiGatewayDomainWithMTLS.domainNameConfiguration.hostedZoneId,
        name: apiGatewayDomainWithMTLS.domainNameConfiguration.targetDomainName,
        evaluateTargetHealth: false
    }]
});

const AAAA_RecordWithMTLS = new aws.route53.Record(`${API_DOMAIN_MTLS}-AAAA-record`, {
    type: RecordType.AAAA,
    name: API_DOMAIN_MTLS,
    zoneId: apiZone.zoneId,
    allowOverwrite: false,
    aliases: [{
        zoneId: apiGatewayDomainWithMTLS.domainNameConfiguration.hostedZoneId,
        name: apiGatewayDomainWithMTLS.domainNameConfiguration.targetDomainName,
        evaluateTargetHealth: false
    }]
});

const pingApi = new aws.apigatewayv2.Api(`MTLS-Ping-Api-Gateway${suffix}`, {
    protocolType: "HTTP",
    disableExecuteApiEndpoint: true, // important
    name: `MTLS-Ping-API${suffix}`,
    description: 'An API to test the MTLS integration'
});

const pingLambdaPermission = new aws.lambda.Permission(`MTLS-Lambda-Permission-Ping-Api${suffix}`, {
    action: "lambda:InvokeFunction",
    principal: "apigateway.amazonaws.com",
    function: functionsRef.getOutput('pingLambdaFunctionName'),
    sourceArn: pulumi.interpolate`${pingApi.executionArn}/*/*`,
}, {dependsOn: [pingApi]});

const pingIntegration = new aws.apigatewayv2.Integration(`MTLS-Lambda-Integration-Ping-Api${suffix}`, {
    apiId: pingApi.id,
    integrationType: "AWS_PROXY",
    integrationUri: functionsRef.getOutput('pingLambdaFunctionArn'),
    integrationMethod: "GET",
    payloadFormatVersion: "2.0",
    passthroughBehavior: "WHEN_NO_MATCH",
    description: 'MTLS Integration between API gateway and the Ping lambda function'
});

const pingRoute = new aws.apigatewayv2.Route(`MTLS-API-Route-Ping${suffix}`, {
    apiId: pingApi.id,
    routeKey: "GET /v1/ping",
    target: pulumi.interpolate`integrations/${pingIntegration.id}`
});

const stage = new aws.apigatewayv2.Stage(`MTLS-API-Stage-Ping-Api${suffix}`, {
    apiId: pingApi.id,
    name: stack,
    autoDeploy: true,
    description: `${suffix} stage for the testing of the mtls`
}, {dependsOn: [pingRoute]});

new aws.apigatewayv2.ApiMapping(`MTLS-API-Mapping-Ping-Api${suffix}`, {
    domainName: apiGatewayDomainWithMTLS.domainName,
    apiId: pingApi.id,
    stage: stage.id,
});

export const apiGatewayCustomDomainNameMtls = apiGatewayDomainWithMTLS.domainName;
export const DNS_AAAA_Record_Mtls = AAAA_RecordWithMTLS;
export const DNS_A_Record_Mtls = A_RecordWithMTLS;
