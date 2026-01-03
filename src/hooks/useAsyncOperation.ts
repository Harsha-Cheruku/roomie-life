import { useState, useCallback } from 'react';
import { useToast } from './use-toast';

interface AsyncOperationOptions {
  successMessage?: string;
  errorMessage?: string;
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
}

interface AsyncOperationResult<T> {
  execute: (operation: () => Promise<T>) => Promise<T | null>;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
}

export const useAsyncOperation = <T = void>(
  options: AsyncOperationOptions = {}
): AsyncOperationResult<T> => {
  const {
    successMessage,
    errorMessage = 'An error occurred',
    showSuccessToast = true,
    showErrorToast = true,
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();

  const execute = useCallback(async (operation: () => Promise<T>): Promise<T | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await operation();
      
      if (showSuccessToast && successMessage) {
        toast({ title: successMessage });
      }
      
      return result;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      
      if (showErrorToast) {
        toast({
          title: errorMessage,
          description: errorObj.message,
          variant: 'destructive',
        });
      }
      
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast, successMessage, errorMessage, showSuccessToast, showErrorToast]);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  return { execute, isLoading, error, reset };
};