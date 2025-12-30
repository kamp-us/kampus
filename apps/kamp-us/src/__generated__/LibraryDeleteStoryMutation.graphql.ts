/**
 * @generated SignedSource<<abc84bf938ad39f6dd0c72f917e707a5>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LibraryDeleteStoryMutation$variables = {
  id: string;
};
export type LibraryDeleteStoryMutation$data = {
  readonly deleteStory: {
    readonly deletedStoryId: string | null | undefined;
    readonly error: {
      readonly code: string;
      readonly message: string;
    } | null | undefined;
    readonly success: boolean;
  };
};
export type LibraryDeleteStoryMutation = {
  response: LibraryDeleteStoryMutation$data;
  variables: LibraryDeleteStoryMutation$variables;
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
    "concreteType": "DeleteStoryPayload",
    "kind": "LinkedField",
    "name": "deleteStory",
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
        "name": "deletedStoryId",
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
    "name": "LibraryDeleteStoryMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "LibraryDeleteStoryMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "018a6de7fb2d4318fd05fc9fe41a6a61",
    "id": null,
    "metadata": {},
    "name": "LibraryDeleteStoryMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryDeleteStoryMutation(\n  $id: String!\n) {\n  deleteStory(id: $id) {\n    success\n    deletedStoryId\n    error {\n      code\n      message\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "eea378c8b39d8a89fba548ff1183ba84";

export default node;
