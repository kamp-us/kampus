/**
 * @generated SignedSource<<af609471399753c4fb86d782acd5810d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type TagManagementUpdateTagMutation$variables = {
  color?: string | null | undefined;
  id: string;
  name?: string | null | undefined;
};
export type TagManagementUpdateTagMutation$data = {
  readonly updateTag: {
    readonly error: {
      readonly code?: string;
      readonly message?: string;
    } | null | undefined;
    readonly tag: {
      readonly color: string;
      readonly id: string;
      readonly name: string;
    } | null | undefined;
  };
};
export type TagManagementUpdateTagMutation = {
  response: TagManagementUpdateTagMutation$data;
  variables: TagManagementUpdateTagMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "color"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "id"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v3 = [
  {
    "kind": "Variable",
    "name": "color",
    "variableName": "color"
  },
  {
    "kind": "Variable",
    "name": "id",
    "variableName": "id"
  },
  {
    "kind": "Variable",
    "name": "name",
    "variableName": "name"
  }
],
v4 = {
  "alias": null,
  "args": null,
  "concreteType": "Tag",
  "kind": "LinkedField",
  "name": "tag",
  "plural": false,
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "id",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "name",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "color",
      "storageKey": null
    }
  ],
  "storageKey": null
},
v5 = [
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
v6 = {
  "kind": "InlineFragment",
  "selections": (v5/*: any*/),
  "type": "TagNameExistsError",
  "abstractKey": null
},
v7 = {
  "kind": "InlineFragment",
  "selections": (v5/*: any*/),
  "type": "InvalidTagNameError",
  "abstractKey": null
},
v8 = {
  "kind": "InlineFragment",
  "selections": (v5/*: any*/),
  "type": "TagNotFoundError",
  "abstractKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "TagManagementUpdateTagMutation",
    "selections": [
      {
        "alias": null,
        "args": (v3/*: any*/),
        "concreteType": "UpdateTagPayload",
        "kind": "LinkedField",
        "name": "updateTag",
        "plural": false,
        "selections": [
          (v4/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": null,
            "kind": "LinkedField",
            "name": "error",
            "plural": false,
            "selections": [
              (v6/*: any*/),
              (v7/*: any*/),
              (v8/*: any*/)
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "TagManagementUpdateTagMutation",
    "selections": [
      {
        "alias": null,
        "args": (v3/*: any*/),
        "concreteType": "UpdateTagPayload",
        "kind": "LinkedField",
        "name": "updateTag",
        "plural": false,
        "selections": [
          (v4/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": null,
            "kind": "LinkedField",
            "name": "error",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "__typename",
                "storageKey": null
              },
              (v6/*: any*/),
              (v7/*: any*/),
              (v8/*: any*/)
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "9a9e3ba3b4f7b8a79ec598cbcfad9421",
    "id": null,
    "metadata": {},
    "name": "TagManagementUpdateTagMutation",
    "operationKind": "mutation",
    "text": "mutation TagManagementUpdateTagMutation(\n  $id: String!\n  $name: String\n  $color: String\n) {\n  updateTag(id: $id, name: $name, color: $color) {\n    tag {\n      id\n      name\n      color\n    }\n    error {\n      __typename\n      ... on TagNameExistsError {\n        code\n        message\n      }\n      ... on InvalidTagNameError {\n        code\n        message\n      }\n      ... on TagNotFoundError {\n        code\n        message\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "dcbad953dbf1e99d6251bdc1f8d757d8";

export default node;
