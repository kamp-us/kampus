/**
 * @generated SignedSource<<0bb476299eae2f270ace6614570f11e1>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LibraryTagsQuery$variables = Record<PropertyKey, never>;
export type LibraryTagsQuery$data = {
  readonly listTags: ReadonlyArray<{
    readonly color: string;
    readonly id: string;
    readonly name: string;
  }>;
};
export type LibraryTagsQuery = {
  response: LibraryTagsQuery$data;
  variables: LibraryTagsQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "Tag",
    "kind": "LinkedField",
    "name": "listTags",
    "plural": true,
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
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryTagsQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "LibraryTagsQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "40b32d546df81848bb7c2ddf9e653f2c",
    "id": null,
    "metadata": {},
    "name": "LibraryTagsQuery",
    "operationKind": "query",
    "text": "query LibraryTagsQuery {\n  listTags {\n    id\n    name\n    color\n  }\n}\n"
  }
};
})();

(node as any).hash = "d9e205e0026c558757863fd070e6e562";

export default node;
