/**
 * @generated SignedSource<<b2b284694e5cc112232fa3989e95690b>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LibraryUpdateStoryMutation$variables = {
  id: string;
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
      readonly title: string;
    } | null | undefined;
  };
};
export type LibraryUpdateStoryMutation = {
  response: LibraryUpdateStoryMutation$data;
  variables: LibraryUpdateStoryMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "id"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "title"
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
            "name": "title",
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
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryUpdateStoryMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "LibraryUpdateStoryMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "758d07b65261671ba669b84a8c742e45",
    "id": null,
    "metadata": {},
    "name": "LibraryUpdateStoryMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryUpdateStoryMutation(\n  $id: String!\n  $title: String\n) {\n  updateStory(id: $id, title: $title) {\n    story {\n      id\n      title\n    }\n    error {\n      code\n      message\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "434202fc2393b076f75b569e808dc8e9";

export default node;
