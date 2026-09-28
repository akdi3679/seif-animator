'use client';

import { Component, ReactNode } from 'react';
import { GlobalErrorPage } from './GlobalErrorPage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    window.location.reload(); // full reload to reset state
  };

  render() {
  if (this.state.hasError) {
    return (
      <GlobalErrorPage
        errorType="render"                        // was "type"
        errorMessage={this.state.error?.message}  // was passing error object
        onRetry={this.handleRetry}
      />
    );
  }
  return this.props.children;
}
}