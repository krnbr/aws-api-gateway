import {
    APIGatewayEventRequestContext,
    APIGatewayProxyEventV2WithRequestContext,
    APIGatewayProxyResultV2
} from "aws-lambda";

exports.handle =  async function(event: APIGatewayProxyEventV2WithRequestContext<APIGatewayEventRequestContext>, context: APIGatewayEventRequestContext): Promise<APIGatewayProxyResultV2> {
    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ping: 'pong',
            success: true,
            timestamp: new Date().getTime()
        })
    }
}