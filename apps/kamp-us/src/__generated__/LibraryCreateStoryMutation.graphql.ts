/**
 * @generated SignedSource<<5c4f0f14c0b4eadd3b08b075059a2daf>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LibraryCreateStoryMutation$variables = {
  title: string;
  url: string;
};
export type LibraryCreateStoryMutation$data = {
  readonly createStory: {
    readonly story: {
      readonly createdAt: string;
      readonly id: string;
      readonly title: string;
      readonly url: string;
    };
  };
};
export type LibraryCreateStoryMutation = {
  response: LibraryCreateStoryMutation$data;
  variables: LibraryCreateStoryMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "title"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "url"
},
v2 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "title",
        "variableName": "title"
      },
      {
        "kind": "Variable",
        "name": "url",
        "variableName": "url"
      }
    ],
    "concreteType": "CreateStoryPayload",
    "kind": "LinkedField",
    "name": "createStory",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "Story",
        "kind": "LinkedField",
        "name": "story",
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
            "name": "url",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "title",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "createdAt",
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
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryCreateStoryMutation",
    "selections": (v2/*: any*/),
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
    "name": "LibraryCreateStoryMutation",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "08402c43111dea0e27f3c0342e95dbb2",
    "id": null,
    "metadata": {},
    "name": "LibraryCreateStoryMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryCreateStoryMutation(\n  $url: String!\n  $title: String!\n) {\n  createStory(url: $url, title: $title) {\n    story {\n      id\n      url\n      title\n      createdAt\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "a1de8a15d05195a6ccf3baa1e2336b1d";

export default node;
