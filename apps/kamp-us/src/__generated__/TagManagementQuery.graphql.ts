/**
 * @generated SignedSource<<bcb307beeb4b6c2e3ecfa88720d4890a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type TagManagementQuery$variables = Record<PropertyKey, never>;
export type TagManagementQuery$data = {
  readonly me: {
    readonly library: {
      readonly tags: ReadonlyArray<{
        readonly color: string;
        readonly id: string;
        readonly name: string;
        readonly stories: {
          readonly totalCount: number;
        };
      }>;
    };
  };
};
export type TagManagementQuery = {
  response: TagManagementQuery$data;
  variables: TagManagementQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
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
            "args": null,
            "concreteType": "Tag",
            "kind": "LinkedField",
            "name": "tags",
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
              },
              {
                "alias": null,
                "args": [
                  {
                    "kind": "Literal",
                    "name": "first",
                    "value": 0
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
                    "kind": "ScalarField",
                    "name": "totalCount",
                    "storageKey": null
                  }
                ],
                "storageKey": "stories(first:0)"
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
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "TagManagementQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "TagManagementQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "32cf5a23eea936299e001483d3cf888d",
    "id": null,
    "metadata": {},
    "name": "TagManagementQuery",
    "operationKind": "query",
    "text": "query TagManagementQuery {\n  me {\n    library {\n      tags {\n        id\n        name\n        color\n        stories(first: 0) {\n          totalCount\n        }\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "8192c79d631021c7ee2bea05a5cd2905";

export default node;
