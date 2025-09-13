"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const web_stack_1 = require("../lib/web-stack");
const identity_stack_1 = require("../lib/identity-stack");
const api_stack_1 = require("../lib/api-stack");
const uploads_stack_1 = require("../lib/uploads-stack");
const app = new cdk.App();
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};
// 1) Web (for Site URL)
const web = new web_stack_1.WebStack(app, "LalaWebStack", { env });
// 2) Cognito using the CloudFront URL as callback (both forms)
const base = `https://${web.distribution.distributionDomainName}`;
const siteNoSlash = base;
const siteSlash = base.endsWith("/") ? base : `${base}/`;
const id = new identity_stack_1.IdentityStack(app, "LalaIdentityStack", {
    env,
    callbackUrls: [siteNoSlash, siteSlash, "http://localhost:5173", "http://localhost:3000"],
    logoutUrls: [siteNoSlash, siteSlash, "http://localhost:5173", "http://localhost:3000"],
});
// 3) AppSync (Cognito auth)
new api_stack_1.ApiStack(app, "LalaApiStack", { env, userPool: id.userPool });
// 4) Uploads API + S3 (Cognito-protected)
new uploads_stack_1.UploadsStack(app, "LalaUploadsStack", { env, userPool: id.userPool });
