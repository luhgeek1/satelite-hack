'use client';

import * as React from 'react';

interface Props {
  children: React.ReactNode;
  fallback: React.ReactNode;
  onFail: () => void;
}

interface State {
  failed: boolean;
}

export class GlobeBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
