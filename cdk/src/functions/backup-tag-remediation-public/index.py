import boto3

ssm = boto3.client("ssm")

CREATE = 'Create'
DELETE = 'Delete'
UPDATE = 'Update'


def exception_handling(function):
    def catch(event, context):
        try:
            function(event, context)
        except Exception as e:
            print(e)
            print(event)
            raise e

    return catch


@exception_handling
def handler(event, context):
    RequestType = event["RequestType"]
    print('RequestType: {}'.format(RequestType))

    Properties = event["ResourceProperties"]
    DocumentName = Properties["DocumentName"]

    id = "{}-{}".format(event.get("PhysicalResourceId"), DocumentName)


    if RequestType == CREATE or RequestType == UPDATE:
        ssm.modify_document_permission(
            Name=DocumentName,
            PermissionType='Share',
            AccountIdsToAdd=['All']
        )
    elif RequestType == DELETE:
        ssm.modify_document_permission(
            Name=DocumentName,
            PermissionType='Share',
            AccountIdsToRemove=['All']
        )

    return {
        'PhysicalResourceId': id,
    }
