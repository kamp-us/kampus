import {Component, type ReactNode, Suspense} from "react";
import {graphql, useLazyLoadQuery} from "react-relay";
import {useNavigate} from "react-router";
import type {MeQuery as MeQueryType} from "../__generated__/MeQuery.graphql";
import {useAuth} from "../auth/AuthContext";
import {Button} from "../design/Button";
import styles from "./Me.module.css";

const MeQuery = graphql`
  query MeQuery {
    me {
      id
      email
      name
    }
  }
`;

function MeContent() {
	const data = useLazyLoadQuery<MeQueryType>(MeQuery, {});
	const {logout} = useAuth();
	const navigate = useNavigate();

	const handleLogout = () => {
		logout();
		navigate("/login");
	};

	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<h2 className={styles.title}>Current User</h2>
				<div className={styles.info}>
					<p>
						<strong>ID:</strong> {data.me.id}
					</p>
					<p>
						<strong>Email:</strong> {data.me.email}
					</p>
					{data.me.name && (
						<p>
							<strong>Name:</strong> {data.me.name}
						</p>
					)}
				</div>
				<Button onClick={handleLogout}>Sign Out</Button>
			</div>
		</div>
	);
}

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = {hasError: false};
	}

	static getDerivedStateFromError() {
		return {hasError: true};
	}

	render() {
		if (this.state.hasError) {
			return this.props.fallback;
		}
		return this.props.children;
	}
}

function NotLoggedIn() {
	const navigate = useNavigate();
	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<p>Not logged in.</p>
				<Button onClick={() => navigate("/login")}>Go to Login</Button>
			</div>
		</div>
	);
}

export function Me() {
	return (
		<ErrorBoundary fallback={<NotLoggedIn />}>
			<Suspense fallback={<div className={styles.container}>Loading...</div>}>
				<MeContent />
			</Suspense>
		</ErrorBoundary>
	);
}
