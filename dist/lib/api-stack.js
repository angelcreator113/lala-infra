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
exports.ApiStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const path = __importStar(require("path"));
const appsync = __importStar(require("aws-cdk-lib/aws-appsync"));
class ApiStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        this.api = new appsync.GraphqlApi(this, "GraphqlApi", {
            name: "lala-api",
            schema: appsync.SchemaFile.fromAsset(path.join(__dirname, "schema.graphql")),
            authorizationConfig: {
                defaultAuthorization: {
                    authorizationType: appsync.AuthorizationType.USER_POOL,
                    userPoolConfig: { userPool: props.userPool }
                }
            },
            xrayEnabled: true
        });
        const helloFn = new lambda.Function(this, "HelloFn", {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: "index.handler",
            code: lambda.Code.fromInline(`
        exports.handler = async () => ({ statusCode: 200, body: JSON.stringify({ hello: "Bestie from Lala API" }) });
      `)
        });
        const ds = new appsync.LambdaDataSource(this, "HelloDS", {
            api: this.api,
            lambdaFunction: helloFn
        });
        ds.createResolver("HelloResolver", {
            typeName: "Query",
            fieldName: "hello"
        });
        new cdk.CfnOutput(this, "GraphqlUrl", { value: this.api.graphqlUrl });
    }
}
exports.ApiStack = ApiStack;
