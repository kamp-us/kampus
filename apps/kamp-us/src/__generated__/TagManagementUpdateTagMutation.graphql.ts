/**
 * @generated SignedSource<<94dd38b664aa39f1415034c1f9bfe980>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type UpdateTagInput = {
  color?: string | null | undefined;
  id: string;
  name?: string | null | undefined;
};
export type TagManagementUpdateTagMutation$variables = {
  input: UpdateTagInput;
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
      readonly stories: {
        readonly totalCount: number;
      };
    } | null | undefined;
  };
};
export type TagManagementUpdateTagMutation = {
  response: TagManagementUpdateTagMutation$data;
  variables: TagManagementUpdateTagMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "input"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "input",
    "variableName": "input"
  }
],
v2 = {
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
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "StoryConnection",
      "kind": "LinkedField",
      "name": "stories",
      "plural": false,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "totalCount",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "storageKey": null
},
v3 = [
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
v4 = {
  "kind": "InlineFragment",
  "selections": (v3/*: any*/),
  "type": "InvalidTagNameError",
  "abstractKey": null
},
v5 = {
  "kind": "InlineFragment",
  "selections": (v3/*: any*/),
  "type": "TagNameExistsError",
  "abstractKey": null
},
v6 = {
  "kind": "InlineFragment",
  "selections": (v3/*: any*/),
  "type": "TagNotFoundError",
  "abstractKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "TagManagementUpdateTagMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "UpdateTagPayload",
        "kind": "LinkedField",
        "name": "updateTag",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": null,
            "kind": "LinkedField",
            "name": "error",
            "plural": false,
            "selections": [
              (v4/*: any*/),
              (v5/*: any*/),
              (v6/*: any*/)
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
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "TagManagementUpdateTagMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "UpdateTagPayload",
        "kind": "LinkedField",
        "name": "updateTag",
        "plural": false,
        "selections": [
          (v2/*: any*/),
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
              (v4/*: any*/),
              (v5/*: any*/),
              (v6/*: any*/)
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "69b45cdd394fcdde17834075045d7a97",
    "id": null,
    "metadata": {},
    "name": "TagManagementUpdateTagMutation",
    "operationKind": "mutation",
    "text": "mutation TagManagementUpdateTagMutation(\n  $input: UpdateTagInput!\n) {\n  updateTag(input: $input) {\n    tag {\n      id\n      name\n      color\n      stories {\n        totalCount\n      }\n    }\n    error {\n      __typename\n      ... on InvalidTagNameError {\n        code\n        message\n      }\n      ... on TagNameExistsError {\n        code\n        message\n      }\n      ... on TagNotFoundError {\n        code\n        message\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "a87a30dc12ec40c17e2123418d2bdbb2";

export default node;
