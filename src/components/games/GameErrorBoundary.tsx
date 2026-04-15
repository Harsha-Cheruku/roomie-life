import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";

interface Props {
  children: ReactNode;
  onBack: () => void;
  gameName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GameErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Games] crash caught by ErrorBoundary", {
      gameName: this.props.gameName,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.gameName !== this.props.gameName) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-4 text-center py-6">
          <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
          <h3 className="text-lg font-bold">{this.props.gameName || "Game"} encountered an error</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Something went wrong. Please try again or go back to the menu.
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={this.handleRetry} variant="default">
              <RotateCcw className="h-4 w-4 mr-2" /> Retry
            </Button>
            <Button onClick={this.props.onBack} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Menu
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
