/**
 * @generated SignedSource<<7c6266e712f3d8f5ecfa570696a820ef>>
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
      readonly id: string;
      readonly tags: ReadonlyArray<{
        readonly color: string;
        readonly id: string;
        readonly name: string;
      }>;
      readonly title: string;
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
            "name": "title",
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
    "cacheID": "cdcc43c5ee38d0ffa7780a905c5eac93",
    "id": null,
    "metadata": {},
    "name": "LibraryUpdateStoryMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryUpdateStoryMutation(\n  $id: String!\n  $title: String\n  $tagIds: [String!]\n) {\n  updateStory(id: $id, title: $title, tagIds: $tagIds) {\n    story {\n      id\n      title\n      tags {\n        id\n        name\n        color\n      }\n    }\n    error {\n      code\n      message\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "956f663b4e8d2176de2dd6c0c26386a6";

export default node;
