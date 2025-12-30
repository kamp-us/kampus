/**
 * @generated SignedSource<<6818034e1c9fa619fc0f5be4bd649436>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LibraryCreateStoryMutation$variables = {
  tagIds?: ReadonlyArray<string> | null | undefined;
  title: string;
  url: string;
};
export type LibraryCreateStoryMutation$data = {
  readonly createStory: {
    readonly story: {
      readonly createdAt: string;
      readonly id: string;
      readonly tags: ReadonlyArray<{
        readonly color: string;
        readonly id: string;
        readonly name: string;
      }>;
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
  "name": "tagIds"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "title"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "url"
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "tagIds",
        "variableName": "tagIds"
      },
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
          (v3/*: any*/),
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
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "Tag",
            "kind": "LinkedField",
            "name": "tags",
            "plural": true,
            "selections": [
              (v3/*: any*/),
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
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryCreateStoryMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "LibraryCreateStoryMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "f61e33eda8d91d56f154cb9aa50cba78",
    "id": null,
    "metadata": {},
    "name": "LibraryCreateStoryMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryCreateStoryMutation(\n  $url: String!\n  $title: String!\n  $tagIds: [String!]\n) {\n  createStory(url: $url, title: $title, tagIds: $tagIds) {\n    story {\n      id\n      url\n      title\n      createdAt\n      tags {\n        id\n        name\n        color\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "19ee1ca524843a06acb6c4066c4fcea3";

export default node;
