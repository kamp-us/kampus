/**
 * @generated SignedSource<<a9bdc8d3fb0c80ea82f4773e55cdba50>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type DeleteStoryInput = {
  id: string;
};
export type LibraryDeleteStoryMutation$variables = {
  input: DeleteStoryInput;
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
    "cacheID": "e7d952555903041d65caf16b5b7543ad",
    "id": null,
    "metadata": {},
    "name": "LibraryDeleteStoryMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryDeleteStoryMutation(\n  $input: DeleteStoryInput!\n) {\n  deleteStory(input: $input) {\n    deletedStoryId\n    success\n    error {\n      message\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "054602bad63c3658c10aea4ab8120fe3";

export default node;
