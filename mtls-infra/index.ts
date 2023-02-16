import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

import {RecordType} from "@pulumi/aws/route53";

const PEM_FILE = 'ca.pem';
const filePath = require("path").join(__dirname, PEM_FILE);

const config = new pulumi.Config();
const HOSTED_ZONE_NAME = config.require("HOSTED_ZONE_NAME");
const SUB_DOMAIN = config.require("SUB_DOMAIN");
const SUB_DOMAIN_MTLS = config.require("SUB_DOMAIN_MTLS");
const API_DOMAIN = config.require("API_DOMAIN");
const API_DOMAIN_MTLS = config.require("API_DOMAIN_MTLS");
const TRUSTSTORE_BUCKET_NAME = `${API_DOMAIN_MTLS}-ts-bckt`

const apiZone = aws.route53.getZoneOutput({
    name: HOSTED_ZONE_NAME
});

const apiCert: aws.acm.Certificate = new aws.acm.Certificate(`${API_DOMAIN}-cert`, {
    domainName: API_DOMAIN,
    validationMethod: 'DNS',
    keyAlgorithm: "EC_prime256v1",
}, {
    retainOnDelete: true
});

const apiCertMtls: aws.acm.Certificate = new aws.acm.Certificate(`${API_DOMAIN_MTLS}-cert`, {
    domainName: API_DOMAIN_MTLS,
    validationMethod: 'DNS',
    keyAlgorithm: "EC_prime256v1",
}, {
    retainOnDelete: true
});

apiCert.domainValidationOptions.apply(opts => {
    let i = 0;
    let api_records: aws.route53.Record[] = [];
    for (const option of opts) {
        i++;
        let record = new aws.route53.Record(`${API_DOMAIN}-dns-validation-record-${i}`, {
            type: option.resourceRecordType,
            zoneId: apiZone.zoneId,
            name: option.resourceRecordName,
            ttl: 600,
            records: [option.resourceRecordValue],
            allowOverwrite: false
        }, { dependsOn: [apiCert] });
        pulumi.log.info(`created ${i} record ${JSON.stringify(option)}`);
        api_records.push(record);
    }
});

apiCertMtls.domainValidationOptions.apply(opts => {
    let i = 0;
    let api_records: aws.route53.Record[] = [];
    for (const option of opts) {
        i++;
        let record = new aws.route53.Record(`${API_DOMAIN_MTLS}-dns-validation-record-${i}`, {
            type: option.resourceRecordType,
            zoneId: apiZone.zoneId,
            name: option.resourceRecordName,
            ttl: 600,
            records: [option.resourceRecordValue],
            allowOverwrite: false
        }, { dependsOn: [apiCert] });
        pulumi.log.info(`created ${i} record ${JSON.stringify(option)}`);
        api_records.push(record);
    }
});

const truststoreBucket = new aws.s3.Bucket(`${TRUSTSTORE_BUCKET_NAME}`, {
    bucket: TRUSTSTORE_BUCKET_NAME,
    acl: "private"
});

const truststoreBucketObject = new aws.s3.BucketObject(`${API_DOMAIN_MTLS}-trust-store-pem`, {
    key: PEM_FILE,
    bucket: truststoreBucket.id,
    source: new pulumi.asset.FileAsset(filePath),
});

// Export the name of the bucket that will contain the truststore pem
export const truststoreBucketName = truststoreBucket.id;
// Export the url of the object that will contain the truststore's pem
export const truststoreObjectKey = truststoreBucketObject.key;
export const api_dns_nameservers = apiZone.nameServers; // helpful for configuring this to your domain provider - specially when it is non AWS.
export const apiZoneId = apiZone.zoneId;
export const apiCertArn = apiCert.arn;
export const apiCertArnMtls = apiCertMtls.arn;
export const apiDomain = API_DOMAIN;
export const subDomain = SUB_DOMAIN;
export const apiDomainMtls = API_DOMAIN_MTLS;
export const subDomainMtls = SUB_DOMAIN_MTLS;
