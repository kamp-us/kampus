/**
 * @generated SignedSource<<5d254ebf449b213abd85ee65505355c5>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type LibraryStoryRefetchQuery$variables = {
  id: string;
};
export type LibraryStoryRefetchQuery$data = {
  readonly node: {
    readonly " $fragmentSpreads": FragmentRefs<"LibraryStoryFragment">;
  } | null | undefined;
};
export type LibraryStoryRefetchQuery = {
  response: LibraryStoryRefetchQuery$data;
  variables: LibraryStoryRefetchQuery$variables;
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
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryStoryRefetchQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "node",
        "plural": false,
        "selections": [
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "LibraryStoryFragment"
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
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "LibraryStoryRefetchQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "node",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "__typename",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "id",
            "storageKey": null
          },
          {
            "kind": "InlineFragment",
            "selections": [
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
              }
            ],
            "type": "Story",
            "abstractKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "755a80e62c86c15302a5821fa1ecdacb",
    "id": null,
    "metadata": {},
    "name": "LibraryStoryRefetchQuery",
    "operationKind": "query",
    "text": "query LibraryStoryRefetchQuery(\n  $id: String!\n) {\n  node(id: $id) {\n    __typename\n    ...LibraryStoryFragment\n    id\n  }\n}\n\nfragment LibraryStoryFragment on Story {\n  id\n  url\n  title\n  createdAt\n}\n"
  }
};
})();

(node as any).hash = "e1df41c7bfa3f37f00a3f23d308d2941";

export default node;
