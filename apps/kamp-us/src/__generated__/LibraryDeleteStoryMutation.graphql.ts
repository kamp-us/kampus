/**
 * @generated SignedSource<<87af4278c8d0c86f95070b5ffce4bc11>>
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
    "kind": "Variable",
    "name": "id",
    "variableName": "id"
  }
],
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "deletedStoryId",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "success",
  "storageKey": null
},
v4 = {
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
      "name": "message",
      "storageKey": null
    }
  ],
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryDeleteStoryMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "DeleteStoryPayload",
        "kind": "LinkedField",
        "name": "deleteStory",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          (v3/*: any*/),
          (v4/*: any*/)
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
    "name": "LibraryDeleteStoryMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "DeleteStoryPayload",
        "kind": "LinkedField",
        "name": "deleteStory",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          {
            "alias": null,
            "args": null,
            "filters": null,
            "handle": "deleteRecord",
            "key": "",
            "kind": "ScalarHandle",
            "name": "deletedStoryId"
          },
          (v3/*: any*/),
          (v4/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "d3c06388279635c77d75fe4aab1ef9f4",
    "id": null,
    "metadata": {},
    "name": "LibraryDeleteStoryMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryDeleteStoryMutation(\n  $id: String!\n) {\n  deleteStory(id: $id) {\n    deletedStoryId\n    success\n    error {\n      message\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "966451cd9ae061af4d54be0d61f4f990";

export default node;
