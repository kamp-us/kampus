/**
 * @generated SignedSource<<e9c520f064c7ff007662e4c2eb067f25>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LibraryFetchUrlMetadataQuery$variables = {
  url: string;
};
export type LibraryFetchUrlMetadataQuery$data = {
  readonly fetchUrlMetadata: {
    readonly description: string | null | undefined;
    readonly error: string | null | undefined;
    readonly title: string | null | undefined;
  };
};
export type LibraryFetchUrlMetadataQuery = {
  response: LibraryFetchUrlMetadataQuery$data;
  variables: LibraryFetchUrlMetadataQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "url"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "url",
        "variableName": "url"
      }
    ],
    "concreteType": "UrlMetadata",
    "kind": "LinkedField",
    "name": "fetchUrlMetadata",
    "plural": false,
    "selections": [
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
        "name": "description",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "error",
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
    "name": "LibraryFetchUrlMetadataQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "LibraryFetchUrlMetadataQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "02d5a9cfacffc90a74caf8813feddb6a",
    "id": null,
    "metadata": {},
    "name": "LibraryFetchUrlMetadataQuery",
    "operationKind": "query",
    "text": "query LibraryFetchUrlMetadataQuery(\n  $url: String!\n) {\n  fetchUrlMetadata(url: $url) {\n    title\n    description\n    error\n  }\n}\n"
  }
};
})();

(node as any).hash = "be197bda07d8774f62ad25bfd65f3d5d";

export default node;
