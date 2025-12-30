/**
 * @generated SignedSource<<2b78c0c47ee99ba2ab20bf716f3d6b7a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LibraryCreateTagMutation$variables = {
  color: string;
  name: string;
};
export type LibraryCreateTagMutation$data = {
  readonly createTag: {
    readonly error: {
      readonly code: string;
      readonly message: string;
    } | null | undefined;
    readonly tag: {
      readonly color: string;
      readonly id: string;
      readonly name: string;
    } | null | undefined;
  };
};
export type LibraryCreateTagMutation = {
  response: LibraryCreateTagMutation$data;
  variables: LibraryCreateTagMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "color"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v2 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "color",
        "variableName": "color"
      },
      {
        "kind": "Variable",
        "name": "name",
        "variableName": "name"
      }
    ],
    "concreteType": "CreateTagPayload",
    "kind": "LinkedField",
    "name": "createTag",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "Tag",
        "kind": "LinkedField",
        "name": "tag",
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
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "TagNameExistsError",
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
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryCreateTagMutation",
    "selections": (v2/*: any*/),
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
    "name": "LibraryCreateTagMutation",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "c455178f75078793864188c28ebde2e9",
    "id": null,
    "metadata": {},
    "name": "LibraryCreateTagMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryCreateTagMutation(\n  $name: String!\n  $color: String!\n) {\n  createTag(name: $name, color: $color) {\n    tag {\n      id\n      name\n      color\n    }\n    error {\n      code\n      message\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "03c11381ef2ddcb037b80d65be72d9f7";

export default node;
