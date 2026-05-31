import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Wallet } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      navigate(user ? '/dashboard' : '/auth');
      return;
    }

    const timeoutId = window.setTimeout(() => {
      navigate('/auth');
    }, 7000);

    return () => window.clearTimeout(timeoutId);
  }, [user, isLoading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="inline-flex items-center gap-3 mb-6">
          <Wallet className="h-12 w-12 text-primary" />
          <span className="text-4xl font-bold text-foreground">Smokzy</span>
        </div>
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    </div>
  );
};

export default Index;
