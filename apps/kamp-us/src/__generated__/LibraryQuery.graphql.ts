/**
 * @generated SignedSource<<954d7bb0bc7cdfeb182d67b5911810a0>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LibraryQuery$variables = {
  after?: string | null | undefined;
  first: number;
};
export type LibraryQuery$data = {
  readonly me: {
    readonly library: {
      readonly stories: {
        readonly edges: ReadonlyArray<{
          readonly cursor: string;
          readonly node: {
            readonly createdAt: string;
            readonly id: string;
            readonly title: string;
            readonly url: string;
          };
        }>;
        readonly pageInfo: {
          readonly endCursor: string | null | undefined;
          readonly hasNextPage: boolean;
        };
      };
    };
  };
};
export type LibraryQuery = {
  response: LibraryQuery$data;
  variables: LibraryQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "after"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "first"
},
v2 = [
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
          {
            "alias": null,
            "args": [
              {
                "kind": "Variable",
                "name": "after",
                "variableName": "after"
              },
              {
                "kind": "Variable",
                "name": "first",
                "variableName": "first"
              }
            ],
            "concreteType": "StoryConnection",
            "kind": "LinkedField",
            "name": "stories",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "concreteType": "StoryEdge",
                "kind": "LinkedField",
                "name": "edges",
                "plural": true,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "Story",
                    "kind": "LinkedField",
                    "name": "node",
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
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "cursor",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "concreteType": "PageInfo",
                "kind": "LinkedField",
                "name": "pageInfo",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "hasNextPage",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "endCursor",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
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
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryQuery",
    "selections": (v2/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "LibraryQuery",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "d7d4b7b63225985aae2cc3c22eddbefb",
    "id": null,
    "metadata": {},
    "name": "LibraryQuery",
    "operationKind": "query",
    "text": "query LibraryQuery(\n  $first: Float!\n  $after: String\n) {\n  me {\n    library {\n      stories(first: $first, after: $after) {\n        edges {\n          node {\n            id\n            url\n            title\n            createdAt\n          }\n          cursor\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "8f4a219f6da202fa1361839d1bbc5068";

export default node;
