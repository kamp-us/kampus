/**
 * @generated SignedSource<<67fb0cd10734c94602fcce7006f8a6d7>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type TagManagementDeleteTagMutation$variables = {
  id: string;
};
export type TagManagementDeleteTagMutation$data = {
  readonly deleteTag: {
    readonly deletedTagId: string | null | undefined;
    readonly error: {
      readonly code: string;
      readonly message: string;
    } | null | undefined;
    readonly success: boolean;
  };
};
export type TagManagementDeleteTagMutation = {
  response: TagManagementDeleteTagMutation$data;
  variables: TagManagementDeleteTagMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "id"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "id",
    "variableName": "id"
  }
],
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "deletedTagId",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "success",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "concreteType": "TagNotFoundError",
  "kind": "LinkedField",
  "name": "error",
  "plural": false,
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "code",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "message",
      "storageKey": null
    }
  ],
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "TagManagementDeleteTagMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "DeleteTagPayload",
        "kind": "LinkedField",
        "name": "deleteTag",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          (v3/*: any*/),
          (v4/*: any*/)
        ],
        "storageKey": null
      }
    ],
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "TagManagementDeleteTagMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "DeleteTagPayload",
        "kind": "LinkedField",
        "name": "deleteTag",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          {
            "alias": null,
            "args": null,
            "filters": null,
            "handle": "deleteRecord",
            "key": "",
            "kind": "ScalarHandle",
            "name": "deletedTagId"
          },
          (v3/*: any*/),
          (v4/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "2fe77ccae7bd4b6f622314b3cf37d130",
    "id": null,
    "metadata": {},
    "name": "TagManagementDeleteTagMutation",
    "operationKind": "mutation",
    "text": "mutation TagManagementDeleteTagMutation(\n  $id: ID!\n) {\n  deleteTag(id: $id) {\n    deletedTagId\n    success\n    error {\n      code\n      message\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "0329b46dc2e65c4d699ef4f4c9113b50";

export default node;
