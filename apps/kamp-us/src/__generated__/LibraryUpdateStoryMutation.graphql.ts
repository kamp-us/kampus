/**
 * @generated SignedSource<<5276b31eb8bd1e72847dd14396058d91>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LibraryUpdateStoryMutation$variables = {
  id: string;
  tagIds?: ReadonlyArray<string> | null | undefined;
  title?: string | null | undefined;
};
export type LibraryUpdateStoryMutation$data = {
  readonly updateStory: {
    readonly error: {
      readonly code: string;
      readonly message: string;
    } | null | undefined;
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
    } | null | undefined;
  };
};
export type LibraryUpdateStoryMutation = {
  response: LibraryUpdateStoryMutation$data;
  variables: LibraryUpdateStoryMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "id"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "tagIds"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "title"
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
        "name": "id",
        "variableName": "id"
      },
      {
        "kind": "Variable",
        "name": "tagIds",
        "variableName": "tagIds"
      },
      {
        "kind": "Variable",
        "name": "title",
        "variableName": "title"
      }
    ],
    "concreteType": "UpdateStoryPayload",
    "kind": "LinkedField",
    "name": "updateStory",
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
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "StoryNotFoundError",
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
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryUpdateStoryMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v2/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "LibraryUpdateStoryMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "9a9907425c554e2c4fa618818423e8a4",
    "id": null,
    "metadata": {},
    "name": "LibraryUpdateStoryMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryUpdateStoryMutation(\n  $id: String!\n  $title: String\n  $tagIds: [String!]\n) {\n  updateStory(id: $id, title: $title, tagIds: $tagIds) {\n    story {\n      id\n      url\n      title\n      createdAt\n      tags {\n        id\n        name\n        color\n      }\n    }\n    error {\n      code\n      message\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "ea5e71b390ca1a86f0bba4afb4134440";

export default node;
