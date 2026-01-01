/**
 * @generated SignedSource<<543d88efc814a9a7cbd6cbc37beb0b83>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LibraryTagsQuery$variables = Record<PropertyKey, never>;
export type LibraryTagsQuery$data = {
  readonly me: {
    readonly library: {
      readonly tags: ReadonlyArray<{
        readonly color: string;
        readonly id: string;
        readonly name: string;
      }>;
    };
  };
};
export type LibraryTagsQuery = {
  response: LibraryTagsQuery$data;
  variables: LibraryTagsQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v1 = {
  "alias": null,
  "args": null,
  "concreteType": "Tag",
  "kind": "LinkedField",
  "name": "tags",
  "plural": true,
  "selections": [
    (v0/*: any*/),
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
};
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryTagsQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "me",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Library",
            "kind": "LinkedField",
            "name": "library",
            "plural": false,
            "selections": [
              (v1/*: any*/)
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "LibraryTagsQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "me",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Library",
            "kind": "LinkedField",
            "name": "library",
            "plural": false,
            "selections": [
              (v1/*: any*/),
              (v0/*: any*/)
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "6ff2a882622d3645e73fa55160161c6b",
    "id": null,
    "metadata": {},
    "name": "LibraryTagsQuery",
    "operationKind": "query",
    "text": "query LibraryTagsQuery {\n  me {\n    library {\n      tags {\n        id\n        name\n        color\n      }\n      id\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "c26185a8cb21e9b90e7bbadc3e17d336";

export default node;
