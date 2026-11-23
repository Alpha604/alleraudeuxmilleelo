/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class FirebaseErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    let readable = error.message || 'Erreur inattendue Firebase';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed.error === 'string') {
        readable = `${parsed.operationType?.toUpperCase() || 'FIRESTORE'} (${parsed.path || '/'}): ${parsed.error}`;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, errorMessage: readable };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('FirebaseErrorBoundary caught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-6 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto" />
          <h3 className="text-sm font-bold text-white">
            {this.props.fallbackTitle || 'Erreur de lecture / sécurité Firebase Firestore'}
          </h3>
          <p className="text-xs text-rose-200/80 font-mono break-all max-w-2xl mx-auto">
            {this.state.errorMessage}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-black px-4 py-2 text-xs font-bold transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Réessayer</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
