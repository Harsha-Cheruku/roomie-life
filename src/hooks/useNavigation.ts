import { useNavigate, useLocation } from 'react-router-dom';
import { useCallback } from 'react';

type TabName = 'home' | 'tasks' | 'expenses' | 'storage' | 'chat';

const TAB_ROUTES: Record<TabName, string> = {
  home: '/',
  tasks: '/tasks',
  expenses: '/expenses',
  storage: '/storage',
  chat: '/chat',
};

const ROUTE_TABS: Record<string, TabName> = {
  '/': 'home',
  '/tasks': 'tasks',
  '/expenses': 'expenses',
  '/storage': 'storage',
  '/chat': 'chat',
};

export const useNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveTab = useCallback((): TabName => {
    return ROUTE_TABS[location.pathname] || 'home';
  }, [location.pathname]);

  const navigateToTab = useCallback((tab: TabName) => {
    const route = TAB_ROUTES[tab];
    if (route) {
      navigate(route);
    }
  }, [navigate]);

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [navigate]);

  return {
    navigate,
    location,
    getActiveTab,
    navigateToTab,
    goBack,
    activeTab: getActiveTab(),
  };
};