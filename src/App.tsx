import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Compass, LayoutDashboard, MessageSquare, Brain, User, 
  Sparkles, Globe, LogOut, ArrowLeftRight, Award, Flame, RefreshCw, Home
} from 'lucide-react';
import { UserProfile, Booking, AppNotification, ProgressTrack, Review, Skill } from './types';

// Import our modular components
import DashboardView from './components/DashboardView';
import ExploreView from './components/ExploreView';
import ChatView from './components/ChatView';
import ProfileView from './components/ProfileView';
import AIRecommendations from './components/AIRecommendations';
import LoginView from './components/LoginView';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'explore' | 'chat' | 'profile' | 'ai-recs'>('dashboard');
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  
  // User specific data
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [progress, setProgress] = useState<ProgressTrack[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Initial Load: Fetch all user profiles from DB and check active session
  useEffect(() => {
    const initApp = async () => {
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        setAllUsers(data);
        
        const savedUserId = localStorage.getItem('logged_in_user_id');
        let initialUser = null;
        if (savedUserId) {
          initialUser = data.find((u: any) => u.id === savedUserId);
        }
        
        if (initialUser) {
          setCurrentUser(initialUser);
          await loadUserSpecificData(initialUser.id);
        } else {
          setCurrentUser(null);
        }
      } catch (err) {
        console.error('Error initializing platform:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initApp();
  }, []);

  const handleLogin = async (user: UserProfile) => {
    setIsLoading(true);
    try {
      localStorage.setItem('logged_in_user_id', user.id);
      setCurrentUser(user);
      await loadUserSpecificData(user.id);
    } catch (err) {
      console.error('Error logging in:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (newUserPayload: any): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserPayload)
      });
      if (res.ok) {
        setIsLoading(true);
        const newUser = await res.json();
        
        // Refresh users list
        const uRes = await fetch('/api/users');
        const uData = await uRes.json();
        setAllUsers(uData);

        localStorage.setItem('logged_in_user_id', newUser.id);
        setCurrentUser(newUser);
        await loadUserSpecificData(newUser.id);
        setIsLoading(false);
        return { success: true };
      } else {
        let errorMsg = 'Failed to register account.';
        try {
          const errData = await res.json();
          errorMsg = errData.error || errorMsg;
        } catch {
          try {
            const rawText = await res.text();
            if (rawText && rawText.trim()) {
              errorMsg = rawText.length > 100 ? `${rawText.substring(0, 97)}...` : rawText;
            }
          } catch {}
        }
        return { success: false, error: errorMsg };
      }
    } catch (err: any) {
      console.error('Error registering:', err);
      return { success: false, error: err.message || 'Error registering account.' };
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('logged_in_user_id');
    setCurrentUser(null);
  };

  const loadUserSpecificData = async (userId: string) => {
    try {
      // 1. Fetch Bookings
      const bookRes = await fetch(`/api/bookings?userId=${userId}`);
      const bookData = await bookRes.json();
      setBookings(bookData);

      // 2. Fetch Notifications
      const notifRes = await fetch(`/api/notifications?userId=${userId}`);
      const notifData = await notifRes.json();
      setNotifications(notifData);

      // 3. Fetch Learning Progress
      const progRes = await fetch(`/api/progress?userId=${userId}`);
      const progData = await progRes.json();
      setProgress(progData);
    } catch (err) {
      console.error('Error loading user-specific data:', err);
    }
  };

  const handleSwitchProfile = async (userId: string) => {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    setIsLoading(true);
    setCurrentUser(user);
    await loadUserSpecificData(userId);
    setIsLoading(false);
  };

  const handleBookSession = async (
    teacher: UserProfile,
    skill: Skill,
    learningOption: string,
    date: string,
    timeSlot: 'Morning' | 'Afternoon' | 'Evening',
    notes: string
  ) => {
    if (!currentUser) return;

    const bookingPayload = {
      teacherId: teacher.id,
      teacherName: teacher.name,
      learnerId: currentUser.id,
      learnerName: currentUser.name,
      skillName: skill.name,
      category: skill.category,
      learningOption,
      date,
      timeSlot,
      notes
    };

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload)
      });
      
      if (!res.ok) {
        let errorMsg = 'Failed to book session';
        try {
          const err = await res.json();
          errorMsg = err.error || errorMsg;
        } catch {}
        alert(errorMsg);
        return;
      }

      // Reload profile credits and bookings
      await syncAllState();
    } catch (err) {
      console.error('Error booking session:', err);
    }
  };

  const handleUpdateBookingStatus = async (
    bookingId: string,
    status: Booking['status'],
    actionUserId: string,
    extraFields?: Partial<Booking>
  ) => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          actionUserId,
          ...extraFields
        })
      });

      if (res.ok) {
        await syncAllState();
      }
    } catch (err) {
      console.error('Error updating booking status:', err);
    }
  };

  const handleLeaveReview = async (reviewData: Omit<Review, 'id' | 'createdAt'>) => {
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewData)
      });

      if (res.ok) {
        await syncAllState();
      }
    } catch (err) {
      console.error('Error posting review:', err);
    }
  };

  const handleMarkNotificationRead = async (notifId: string) => {
    try {
      const res = await fetch(`/api/notifications/${notifId}/read`, {
        method: 'PUT'
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
      }
    } catch (err) {
      console.error('Error marking notification read:', err);
    }
  };

  const handleDeleteNotification = async (notifId: string) => {
    try {
      const res = await fetch(`/api/notifications/${notifId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setNotifications(prev => prev.filter(n => n.id !== notifId));
      }
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const handleSaveProfile = async (updatedProfile: UserProfile) => {
    if (!currentUser) return;
    setIsSaving(true);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile)
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data);
        // Refresh the complete users list
        const uRes = await fetch('/api/users');
        const uData = await uRes.json();
        setAllUsers(uData);
      }
    } catch (err) {
      console.error('Error saving profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const syncAllState = async () => {
    if (!currentUser) return;
    
    // Refresh list of users
    const uRes = await fetch('/api/users');
    const uData = await uRes.json();
    setAllUsers(uData);

    // Refresh current user stats (e.g. credits, swaps count)
    const freshCurrentUser = uData.find((u: any) => u.id === currentUser.id);
    if (freshCurrentUser) {
      setCurrentUser(freshCurrentUser);
    }

    // Refresh active bookings, notifications, and progress
    await loadUserSpecificData(currentUser.id);
  };

  const handleSelectRecommendedSkill = (skillName: string, category: string) => {
    // We navigate to explorer with preset category/search preloaded inside ExploreView
    setActiveTab('explore');
  };

  // Contacts list (everyone except the logged-in user)
  const contacts = allUsers.filter(u => currentUser && u.id !== currentUser.id);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent shadow-sm"></div>
        <div className="text-center space-y-1">
          <h2 className="font-sans font-medium text-slate-800 tracking-tight text-lg">Loading Skill Swap Platform...</h2>
          <p className="text-slate-500 text-xs">Preparing swapper index and scheduling calendars.</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-700 antialiased justify-between">
        <div className="flex-1 flex items-center justify-center">
          <LoginView 
            onLogin={handleLogin} 
            onRegister={handleRegister} 
            allUsers={allUsers} 
          />
        </div>
        <footer className="bg-white border-t border-slate-200 py-4 text-center text-[10px] text-slate-400 font-medium">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p>© 2026 Skill Swap Platform. Built for mutual skill barters. No money required. Powered by Spark Economy.</p>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-700 select-none antialiased">
      
      {/* Top Header Navigation */}
      <header className="sticky top-0 bg-white border-b border-slate-200 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          
          {/* Logo / Home Button */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity bg-transparent border-0 p-0 text-left"
            title="Go to Home Dashboard"
          >
            <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-bold text-sm shadow-md shadow-indigo-600/10">
              ⇆
            </div>
            <div>
              <span className="font-serif font-bold text-slate-900 tracking-tight text-base leading-none block">Skill Swap Platform</span>
              <p className="text-[9px] text-slate-400 font-medium tracking-wide uppercase leading-none mt-0.5">Collaborative barter platform</p>
            </div>
          </button>

          {/* Primary Tabs */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer border-0 ${
                activeTab === 'dashboard' 
                  ? 'bg-indigo-50 text-indigo-700' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 bg-transparent'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              Home
            </button>
            <button
              onClick={() => setActiveTab('explore')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'explore' 
                  ? 'bg-indigo-50 text-indigo-700' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              Browse Swappers
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'chat' 
                  ? 'bg-indigo-50 text-indigo-700' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat & Live Call
            </button>
            <button
              onClick={() => setActiveTab('ai-recs')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'ai-recs' 
                  ? 'bg-indigo-50 text-indigo-700' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              Skill Advisor
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'profile' 
                  ? 'bg-indigo-50 text-indigo-700' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              My Profile
            </button>
          </nav>

          {/* User Quick Switcher perspective */}
          <div className="flex items-center gap-3">
            <button
              onClick={syncAllState}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition"
              title="Sync All States"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition border-0 bg-transparent cursor-pointer"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <img 
                src={currentUser.avatar} 
                alt={currentUser.name} 
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full object-cover border border-slate-200"
              />
              <div className="hidden sm:block text-right">
                <p className="font-semibold text-slate-800 text-[10px] leading-tight truncate max-w-[100px]">{currentUser.name}</p>
                <span className="text-[9px] text-indigo-600 font-semibold bg-indigo-50 px-1 py-0.2 rounded leading-none">{currentUser.credits} Credits</span>
              </div>
            </div>
          </div>

        </div>
      </header>

      {/* Mobile Navigation Header */}
      <div className="md:hidden sticky top-14 bg-white border-b border-slate-150 z-30 flex items-center justify-around py-2.5 text-[10px] font-bold text-slate-500 shadow-xs">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-indigo-600' : ''}`}
        >
          <Home className="w-4 h-4" />
          Home
        </button>
        <button 
          onClick={() => setActiveTab('explore')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'explore' ? 'text-indigo-600' : ''}`}
        >
          <Compass className="w-4 h-4" />
          Swappers
        </button>
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'chat' ? 'text-indigo-600' : ''}`}
        >
          <MessageSquare className="w-4 h-4" />
          Chat
        </button>
        <button 
          onClick={() => setActiveTab('ai-recs')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'ai-recs' ? 'text-indigo-600' : ''}`}
        >
          <Brain className="w-4 h-4" />
          Advisor
        </button>
        <button 
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'profile' ? 'text-indigo-600' : ''}`}
        >
          <User className="w-4 h-4" />
          Profile
        </button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'dashboard' && (
              <DashboardView 
                currentUser={currentUser}
                bookings={bookings}
                notifications={notifications}
                progress={progress}
                onUpdateBookingStatus={handleUpdateBookingStatus}
                onLeaveReview={handleLeaveReview}
                onMarkNotificationRead={handleMarkNotificationRead}
                onDeleteNotification={handleDeleteNotification}
                onSwitchProfile={handleSwitchProfile}
                allUsers={allUsers}
              />
            )}

            {activeTab === 'explore' && (
              <ExploreView 
                currentUser={currentUser}
                users={allUsers}
                onBookSession={handleBookSession}
                onOpenChat={(id) => {
                  setActiveTab('chat');
                }}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'chat' && (
              <ChatView 
                currentUser={currentUser}
                contacts={contacts}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView 
                currentUser={currentUser}
                onSaveProfile={handleSaveProfile}
                isSaving={isSaving}
              />
            )}

            {activeTab === 'ai-recs' && (
              <AIRecommendations 
                currentUser={currentUser}
                onSelectRecommendedSkill={handleSelectRecommendedSkill}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Humble Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-[10px] text-slate-400 font-medium">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p>© 2026 ExchangeYourSkill. Built for mutual skill barters. No money required. Powered by Spark Economy.</p>
        </div>
      </footer>

    </div>
  );
}
