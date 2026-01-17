/**
 * @generated SignedSource<<e04f7fd9b5fbbe63e697ab83ca5a1d06>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LoginSignInMutation$variables = {
  email: string;
  password: string;
};
export type LoginSignInMutation$data = {
  readonly signIn: {
    readonly token: string;
    readonly user: {
      readonly email: string;
      readonly id: string;
      readonly name: string | null | undefined;
    };
  } | null | undefined;
};
export type LoginSignInMutation = {
  response: LoginSignInMutation$data;
  variables: LoginSignInMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "email"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "password"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "email",
        "variableName": "email"
      },
      {
        "kind": "Variable",
        "name": "password",
        "variableName": "password"
      }
    ],
    "concreteType": "SignInResponse",
    "kind": "LinkedField",
    "name": "signIn",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "user",
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
            "name": "email",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "name",
            "storageKey": null
          }
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "token",
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
    "name": "LoginSignInMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "LoginSignInMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "7af47668c3b89cdc71d19ff35858e2df",
    "id": null,
    "metadata": {},
    "name": "LoginSignInMutation",
    "operationKind": "mutation",
    "text": "mutation LoginSignInMutation(\n  $email: String!\n  $password: String!\n) {\n  signIn(email: $email, password: $password) {\n    user {\n      id\n      email\n      name\n    }\n    token\n  }\n}\n"
  }
};
})();

(node as any).hash = "6670ca69b1aad7d0bfb6f5c839f3f5d7";

export default node;
