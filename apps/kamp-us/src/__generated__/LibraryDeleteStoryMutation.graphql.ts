/**
 * @generated SignedSource<<93cdd4df3115b91a244dcdebf4850d46>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LibraryDeleteStoryMutation$variables = {
  connections: ReadonlyArray<string>;
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
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "connections"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "id"
},
v2 = [
  {
    "kind": "Variable",
    "name": "id",
    "variableName": "id"
  }
],
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
  "kind": "ScalarField",
  "name": "deletedStoryId",
  "storageKey": null
},
v5 = {
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
};
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryDeleteStoryMutation",
    "selections": [
      {
        "alias": null,
        "args": (v2/*: any*/),
        "concreteType": "DeleteStoryPayload",
        "kind": "LinkedField",
        "name": "deleteStory",
        "plural": false,
        "selections": [
          (v3/*: any*/),
          (v4/*: any*/),
          (v5/*: any*/)
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
    "name": "LibraryDeleteStoryMutation",
    "selections": [
      {
        "alias": null,
        "args": (v2/*: any*/),
        "concreteType": "DeleteStoryPayload",
        "kind": "LinkedField",
        "name": "deleteStory",
        "plural": false,
        "selections": [
          (v3/*: any*/),
          (v4/*: any*/),
          {
            "alias": null,
            "args": null,
            "filters": null,
            "handle": "deleteEdge",
            "key": "",
            "kind": "ScalarHandle",
            "name": "deletedStoryId",
            "handleArgs": [
              {
                "kind": "Variable",
                "name": "connections",
                "variableName": "connections"
              }
            ]
          },
          (v5/*: any*/)
        ],
        "storageKey": null
      }
    ]
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

(node as any).hash = "5a922b601817a8f10faa5bdb44cdc86b";

export default node;
