/**
 * @generated SignedSource<<7600e75bbaefea22890493a52f761144>>
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
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "id",
        "variableName": "id"
      }
    ],
    "concreteType": "DeleteTagPayload",
    "kind": "LinkedField",
    "name": "deleteTag",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "success",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "deletedTagId",
        "storageKey": null
      },
      {
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
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "TagManagementDeleteTagMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "TagManagementDeleteTagMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "c1fbf1da564fe4b57f6941ff9e4c47f5",
    "id": null,
    "metadata": {},
    "name": "TagManagementDeleteTagMutation",
    "operationKind": "mutation",
    "text": "mutation TagManagementDeleteTagMutation(\n  $id: String!\n) {\n  deleteTag(id: $id) {\n    success\n    deletedTagId\n    error {\n      code\n      message\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "1a485a6f3e5215753099e04d8d94bbef";

export default node;
