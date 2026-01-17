/**
 * @generated SignedSource<<7191a22e57402c492f4ea85588fbdcb2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LibraryCreateTagMutation$variables = {
  color: string;
  name: string;
};
export type LibraryCreateTagMutation$data = {
  readonly createTag: {
    readonly error: {
      readonly message?: string;
    } | null | undefined;
    readonly tag: {
      readonly color: string;
      readonly id: string;
      readonly name: string;
    } | null | undefined;
  };
};
export type LibraryCreateTagMutation = {
  response: LibraryCreateTagMutation$data;
  variables: LibraryCreateTagMutation$variables;
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
  "name": "name"
},
v2 = [
  {
    "kind": "Variable",
    "name": "color",
    "variableName": "color"
  },
  {
    "kind": "Variable",
    "name": "name",
    "variableName": "name"
  }
],
v3 = {
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
v4 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "message",
    "storageKey": null
  }
],
v5 = {
  "kind": "InlineFragment",
  "selections": (v4/*: any*/),
  "type": "InvalidTagNameError",
  "abstractKey": null
},
v6 = {
  "kind": "InlineFragment",
  "selections": (v4/*: any*/),
  "type": "TagNameExistsError",
  "abstractKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryCreateTagMutation",
    "selections": [
      {
        "alias": null,
        "args": (v2/*: any*/),
        "concreteType": "CreateTagPayload",
        "kind": "LinkedField",
        "name": "createTag",
        "plural": false,
        "selections": [
          (v3/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": null,
            "kind": "LinkedField",
            "name": "error",
            "plural": false,
            "selections": [
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
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "LibraryCreateTagMutation",
    "selections": [
      {
        "alias": null,
        "args": (v2/*: any*/),
        "concreteType": "CreateTagPayload",
        "kind": "LinkedField",
        "name": "createTag",
        "plural": false,
        "selections": [
          (v3/*: any*/),
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
    "cacheID": "40f0c4400579892fb7214b6b4a985b12",
    "id": null,
    "metadata": {},
    "name": "LibraryCreateTagMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryCreateTagMutation(\n  $name: String!\n  $color: String!\n) {\n  createTag(name: $name, color: $color) {\n    tag {\n      id\n      name\n      color\n    }\n    error {\n      __typename\n      ... on InvalidTagNameError {\n        message\n      }\n      ... on TagNameExistsError {\n        message\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "b073b673a1055cafea8daf8b94091e02";

export default node;
