import {useState, type FormEvent} from "react";
import {useNavigate} from "react-router";
import {graphql, useMutation} from "react-relay";
import {Button} from "../design/Button";
import {Field} from "../design/Field";
import {Fieldset} from "../design/Fieldset";
import {Input} from "../design/Input";
import {PasswordInput} from "../design/PasswordInput";
import {useAuth} from "../auth/AuthContext";
import type {LoginSignInMutation} from "../__generated__/LoginSignInMutation.graphql";
import styles from "./Login.module.css";

const SignInMutation = graphql`
  mutation LoginSignInMutation($email: String!, $password: String!) {
    signIn(email: $email, password: $password) {
      user {
        id
        email
        name
      }
      token
    }
  }
`;

export function Login() {
	const navigate = useNavigate();
	const {login, isAuthenticated} = useAuth();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);

	const [commitSignIn, isSigningIn] = useMutation<LoginSignInMutation>(SignInMutation);

	// Redirect if already authenticated
	if (isAuthenticated) {
		navigate("/me");
		return null;
	}

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		setError(null);

		commitSignIn({
			variables: {email, password},
			onCompleted: (response) => {
				const {user, token} = response.signIn;
				login(
					{
						id: user.id,
						email: user.email,
						name: user.name ?? undefined,
					},
					token,
				);
				navigate("/me");
			},
			onError: (err) => {
				setError(err.message || "Login failed. Please check your credentials.");
			},
		});
	};

	return (
		<div className={styles.container}>
			<form onSubmit={handleSubmit} className={styles.form}>
				{error && <div className={styles.error}>{error}</div>}

				<Fieldset.Root>
					<Fieldset.Legend>Sign In</Fieldset.Legend>

					<Field
						label="Email"
						description="Foo bar"
						control={
							<Input
								type="email"
								value={email}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
								required
							/>
						}
					/>

					<Field
						label="Password"
						control={
							<PasswordInput
								value={password}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
								required
							/>
						}
					/>
				</Fieldset.Root>

				<Button type="submit" disabled={isSigningIn}>
					{isSigningIn ? "Signing in..." : "Sign In"}
				</Button>
			</form>
		</div>
	);
}
