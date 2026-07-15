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

// Fallback mock data when API is unreachable
import { fallbackUsers, fallbackBookings, fallbackNotifications, fallbackProgress } from './data/fallbackUsers';

// Robust fetch helper with automatic retries and exponential backoff
async function fetchWithRetry(url: string, options?: RequestInit, retries = 5, delay = 800): Promise<Response> {
  try {
    const res = await fetch(url, options);
    if (!res.ok && retries > 0 && res.status >= 500) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 1.5);
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 1.5);
    }
    throw err;
  }
}

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
        let data;
        try {
          const res = await fetchWithRetry('/api/users');
          data = await res.json();
          if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Invalid users data from server');
          }
          // Also update local storage cache
          localStorage.setItem('local_users', JSON.stringify(data));
        } catch (err) {
          console.warn('API /api/users failed, loading from local fallback:', err);
          const savedLocalUsers = localStorage.getItem('local_users');
          if (savedLocalUsers) {
            try {
              data = JSON.parse(savedLocalUsers);
            } catch {
              data = fallbackUsers;
            }
          } else {
            data = fallbackUsers;
            localStorage.setItem('local_users', JSON.stringify(fallbackUsers));
          }
        }
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
      let registeredUser = null;
      try {
        const res = await fetchWithRetry('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUserPayload)
        });
        if (res.ok) {
          registeredUser = await res.json();
        }
      } catch (e) {
        console.warn('API registration failed, performing local registration instead:', e);
      }

      setIsLoading(true);

      // Add to list of all users
      let updatedUsers = [...allUsers];
      if (registeredUser) {
        // If server register succeeded, make sure we merge it
        if (!updatedUsers.some(u => u.id === registeredUser.id)) {
          updatedUsers.push(registeredUser);
        }
      } else {
        // Local register fallback
        const localNewUser: UserProfile = {
          ...newUserPayload,
          rating: 5,
          reviewsCount: 0,
          successfulExchanges: 0,
          credits: 5,
          badges: []
        };
        registeredUser = localNewUser;
        if (!updatedUsers.some(u => u.id === localNewUser.id)) {
          updatedUsers.push(localNewUser);
        }
      }

      setAllUsers(updatedUsers);
      localStorage.setItem('local_users', JSON.stringify(updatedUsers));

      localStorage.setItem('logged_in_user_id', registeredUser.id);
      setCurrentUser(registeredUser);
      await loadUserSpecificData(registeredUser.id);
      setIsLoading(false);
      return { success: true };
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
      let bookData;
      try {
        const bookRes = await fetchWithRetry(`/api/bookings?userId=${userId}`);
        bookData = await bookRes.json();
        if (!Array.isArray(bookData)) throw new Error();
        localStorage.setItem(`local_bookings_${userId}`, JSON.stringify(bookData));
      } catch {
        const savedBookings = localStorage.getItem(`local_bookings_${userId}`);
        if (savedBookings) {
          bookData = JSON.parse(savedBookings);
        } else {
          bookData = fallbackBookings.filter(b => b.teacherId === userId || b.learnerId === userId);
          localStorage.setItem(`local_bookings_${userId}`, JSON.stringify(bookData));
        }
      }
      setBookings(bookData);

      // 2. Fetch Notifications
      let notifData;
      try {
        const notifRes = await fetchWithRetry(`/api/notifications?userId=${userId}`);
        notifData = await notifRes.json();
        if (!Array.isArray(notifData)) throw new Error();
        localStorage.setItem(`local_notifications_${userId}`, JSON.stringify(notifData));
      } catch {
        const savedNotifs = localStorage.getItem(`local_notifications_${userId}`);
        if (savedNotifs) {
          notifData = JSON.parse(savedNotifs);
        } else {
          notifData = fallbackNotifications.filter(n => n.userId === userId);
          localStorage.setItem(`local_notifications_${userId}`, JSON.stringify(notifData));
        }
      }
      setNotifications(notifData);

      // 3. Fetch Learning Progress
      let progData;
      try {
        const progRes = await fetchWithRetry(`/api/progress?userId=${userId}`);
        progData = await progRes.json();
        if (!Array.isArray(progData)) throw new Error();
        localStorage.setItem(`local_progress_${userId}`, JSON.stringify(progData));
      } catch {
        const savedProg = localStorage.getItem(`local_progress_${userId}`);
        if (savedProg) {
          progData = JSON.parse(savedProg);
        } else {
          progData = fallbackProgress.filter(p => p.userId === userId);
          localStorage.setItem(`local_progress_${userId}`, JSON.stringify(progData));
        }
      }
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

    let bookingSucceeded = false;
    try {
      const res = await fetchWithRetry('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload)
      });
      
      if (res.ok) {
        bookingSucceeded = true;
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to book session');
        return;
      }
    } catch (err) {
      console.warn('API booking failed, registering local booking:', err);
    }

    if (!bookingSucceeded) {
      // Create local fallback booking
      const localBooking: Booking = {
        id: `local-booking-${Date.now()}`,
        teacherId: teacher.id,
        teacherName: teacher.name,
        learnerId: currentUser.id,
        learnerName: currentUser.name,
        skillName: skill.name,
        category: skill.category,
        learningOption: learningOption as any,
        date,
        timeSlot,
        notes,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      
      const currentBookings = [...bookings, localBooking];
      setBookings(currentBookings);
      localStorage.setItem(`local_bookings_${currentUser.id}`, JSON.stringify(currentBookings));

      // Also deduct 1 credit from currentUser locally
      const updatedUser = {
        ...currentUser,
        credits: Math.max(0, currentUser.credits - 1)
      };
      setCurrentUser(updatedUser);
      const updatedUsers = allUsers.map(u => u.id === currentUser.id ? updatedUser : u);
      setAllUsers(updatedUsers);
      localStorage.setItem('local_users', JSON.stringify(updatedUsers));
      alert('Session requested successfully! (Offline Sandbox Mode)');
    } else {
      await syncAllState();
    }
  };

  const handleUpdateBookingStatus = async (
    bookingId: string,
    status: Booking['status'],
    actionUserId: string,
    extraFields?: Partial<Booking>
  ) => {
    let updateSucceeded = false;
    try {
      const res = await fetchWithRetry(`/api/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          actionUserId,
          ...extraFields
        })
      });

      if (res.ok) {
        updateSucceeded = true;
      }
    } catch (err) {
      console.warn('API update status failed, saving locally:', err);
    }

    if (!updateSucceeded && currentUser) {
      const updatedBookings = bookings.map(b => {
        if (b.id === bookingId) {
          return { ...b, status, ...extraFields };
        }
        return b;
      });
      setBookings(updatedBookings);
      localStorage.setItem(`local_bookings_${currentUser.id}`, JSON.stringify(updatedBookings));

      // If completing, we also credit the teacher
      if (status === 'completed') {
        const targetBooking = bookings.find(b => b.id === bookingId);
        if (targetBooking) {
          const updatedUsers = allUsers.map(u => {
            if (u.id === targetBooking.teacherId) {
              return { 
                ...u, 
                credits: u.credits + 1, 
                successfulExchanges: u.successfulExchanges + 1 
              };
            }
            return u;
          });
          setAllUsers(updatedUsers);
          localStorage.setItem('local_users', JSON.stringify(updatedUsers));
        }
      }
    } else {
      await syncAllState();
    }
  };

  const handleLeaveReview = async (reviewData: Omit<Review, 'id' | 'createdAt'>) => {
    let reviewSucceeded = false;
    try {
      const res = await fetchWithRetry('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewData)
      });

      if (res.ok) {
        reviewSucceeded = true;
      }
    } catch (err) {
      console.warn('API review failed, saving review locally:', err);
    }

    if (!reviewSucceeded && currentUser) {
      // Locally increment reviews for teacher and rate
      const updatedUsers = allUsers.map(u => {
        if (u.id === reviewData.teacherId) {
          const newCount = u.reviewsCount + 1;
          const newRating = Number(((u.rating * u.reviewsCount + reviewData.rating) / newCount).toFixed(1));
          return {
            ...u,
            reviewsCount: newCount,
            rating: newRating
          };
        }
        return u;
      });
      setAllUsers(updatedUsers);
      localStorage.setItem('local_users', JSON.stringify(updatedUsers));
    } else {
      await syncAllState();
    }
  };

  const handleMarkNotificationRead = async (notifId: string) => {
    try {
      await fetchWithRetry(`/api/notifications/${notifId}/read`, {
        method: 'PUT'
      });
    } catch (err) {
      console.warn('API notification read failed, continuing offline:', err);
    }

    setNotifications(prev => {
      const next = prev.map(n => n.id === notifId ? { ...n, read: true } : n);
      if (currentUser) {
        localStorage.setItem(`local_notifications_${currentUser.id}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const handleDeleteNotification = async (notifId: string) => {
    try {
      await fetchWithRetry(`/api/notifications/${notifId}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.warn('API notification delete failed, continuing offline:', err);
    }

    setNotifications(prev => {
      const next = prev.filter(n => n.id !== notifId);
      if (currentUser) {
        localStorage.setItem(`local_notifications_${currentUser.id}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const handleSaveProfile = async (updatedProfile: UserProfile) => {
    setIsSaving(true);

    let saveSucceeded = false;
    try {
      const res = await fetchWithRetry('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile)
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data);
        saveSucceeded = true;
      }
    } catch (err) {
      console.warn('API save profile failed, performing locally:', err);
    }

    if (!saveSucceeded) {
      setCurrentUser(updatedProfile);
      const updatedUsers = allUsers.map(u => u.id === updatedProfile.id ? updatedProfile : u);
      setAllUsers(updatedUsers);
      localStorage.setItem('local_users', JSON.stringify(updatedUsers));
    } else {
      // Refresh the complete users list
      try {
        const uRes = await fetchWithRetry('/api/users');
        const uData = await uRes.json();
        setAllUsers(uData);
      } catch {
        // Fall back to local update
      }
    }
    setIsSaving(false);
  };

  const syncAllState = async () => {
    try {
      // Refresh list of users
      const uRes = await fetchWithRetry('/api/users');
      const uData = await uRes.json();
      setAllUsers(uData);

      // Refresh current user stats (e.g. credits, swaps count)
      const freshCurrentUser = uData.find((u: any) => u.id === currentUser.id);
      if (freshCurrentUser) {
        setCurrentUser(freshCurrentUser);
      }

      // Refresh active bookings, notifications, and progress
      await loadUserSpecificData(currentUser.id);
    } catch (err) {
      console.warn('API sync failed, continuing offline:', err);
      // Retrieve locally saved values
      const savedLocalUsers = localStorage.getItem('local_users');
      if (savedLocalUsers) {
        try {
          const uData = JSON.parse(savedLocalUsers);
          setAllUsers(uData);
          const freshCurrentUser = uData.find((u: any) => u.id === currentUser.id);
          if (freshCurrentUser) {
            setCurrentUser(freshCurrentUser);
          }
        } catch {}
      }
      await loadUserSpecificData(currentUser.id);
    }
  };

  const handleSelectRecommendedSkill = (skillName: string, category: string) => {
    // We navigate the user to explore and set appropriate filters
    setActiveTab('explore');
  };

  // Switch to the appropriate screen
  const renderContent = () => {
    if (!currentUser) {
      return (
        <LoginView 
          onLogin={handleLogin} 
          onRegister={handleRegister}
          allUsers={allUsers}
        />
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardView 
            currentUser={currentUser}
            bookings={bookings}
            notifications={notifications}
            progress={progress}
            onUpdateBookingStatus={handleUpdateBookingStatus}
            onLeaveReview={handleLeaveReview}
            onMarkNotificationRead={handleMarkNotificationRead}
            onDeleteNotification={handleDeleteNotification}
            onSwitchTab={(tab) => setActiveTab(tab as any)}
          />
        );
      case 'explore':
        return (
          <ExploreView 
            currentUser={currentUser}
            users={allUsers}
            onBookSession={handleBookSession}
            onOpenChat={(targetUserId) => {
              setActiveTab('chat');
              // Automatically activate chat in child component
              setTimeout(() => {
                const event = new CustomEvent('open-chat-session', { detail: targetUserId });
                window.dispatchEvent(event);
              }, 100);
            }}
            isLoading={isLoading}
          />
        );
      case 'chat':
        return (
          <ChatView 
            currentUser={currentUser}
            allUsers={allUsers}
          />
        );
      case 'ai-recs':
        return (
          <AIRecommendations 
            currentUser={currentUser}
            allUsers={allUsers}
            onSelectSkill={handleSelectRecommendedSkill}
          />
        );
      case 'profile':
        return (
          <ProfileView 
            currentUser={currentUser}
            isSaving={isSaving}
            onSaveProfile={handleSaveProfile}
            allUsers={allUsers}
            onSwitchProfile={handleSwitchProfile}
          />
        );
      default:
        return <div>Not found</div>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Dynamic Header */}
      {currentUser && (
        <header className="bg-white border-b border-slate-100 sticky top-0 z-40 shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 text-white rounded-xl">
                <ArrowLeftRight id="logo-icon" className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-serif font-bold text-lg text-slate-900 leading-tight">ExchangeYourSkill</h1>
                <p className="text-[10px] font-mono text-indigo-600 uppercase tracking-wider">Skill Swapping Network</p>
              </div>
            </div>

            {/* Quick user status */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1 text-xs text-indigo-700 font-medium">
                <Award className="w-4 h-4 text-indigo-600" />
                <span>{currentUser.credits} Swap Credits</span>
              </div>
              
              {currentUser.successfulExchanges > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-1 text-xs text-amber-800 font-medium">
                  <Flame className="w-4 h-4 text-amber-500 animate-pulse" />
                  <span>{currentUser.successfulExchanges} Swaps</span>
                </div>
              )}

              <div className="h-6 w-[1px] bg-slate-200 hidden sm:block"></div>

              <div className="flex items-center gap-2.5">
                <img 
                  src={currentUser.avatar} 
                  alt={currentUser.name} 
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                />
                <div className="text-left hidden md:block">
                  <div className="text-xs font-bold text-slate-800 leading-none">{currentUser.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{currentUser.email}</div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main Container */}
      <main className="flex-1 flex flex-col max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentUser ? activeTab : 'login'}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Persistent Bottom Bar for Logged In State */}
      {currentUser && (
        <nav className="bg-white border-t border-slate-100 py-2 sm:py-3 sticky bottom-0 z-40 shadow-lg mt-auto">
          <div className="max-w-md mx-auto px-4 flex items-center justify-between">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'dashboard' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-[10px] font-medium">Home</span>
            </button>

            <button
              onClick={() => setActiveTab('explore')}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'explore' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Compass className="w-5 h-5" />
              <span className="text-[10px] font-medium">Explore</span>
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'chat' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <div className="relative">
                <MessageSquare className="w-5 h-5" />
                {notifications.some(n => !n.read && n.type === 'request') && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white"></span>
                )}
              </div>
              <span className="text-[10px] font-medium">Chats</span>
            </button>

            <button
              onClick={() => setActiveTab('ai-recs')}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'ai-recs' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Brain className="w-5 h-5" />
              <span className="text-[10px] font-medium">AI Coach</span>
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'profile' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <User className="w-5 h-5" />
              <span className="text-[10px] font-medium">Profile</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
