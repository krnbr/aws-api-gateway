import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const org = pulumi.getOrganization();
const project = pulumi.getProject();
const stack = pulumi.getStack();
const suffix = `-${project}-${stack}`;

const infraRef = new pulumi.StackReference(`${org}/mtls-infra/${stack}`);

const lambdaRole = new aws.iam.Role(`Role-Functions-Api${suffix}`, {
    assumeRolePolicy: {
        Version: "2012-10-17",
        Statement: [
            {
                Action: "sts:AssumeRole",
                Principal: {
                    Service: "lambda.amazonaws.com",
                },
                Effect: "Allow",
                Sid: "",
            },
        ],
    },
});

const lambdaRoleAttachment = new aws.iam.RolePolicyAttachment(`Role-Attachment-Api${suffix}`, {
    role: lambdaRole,
    policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
});

const pingLambda = new aws.lambda.Function(`Ping-Function${suffix}`, {
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("./ping"),
    }),
    runtime: "nodejs16.x",
    role: lambdaRole.arn,
    handler: "handler.handle",
    publish: true
});

export const pingLambdaFunctionName = pingLambda.name;
export const pingLambdaFunctionArn = pingLambda.arn;