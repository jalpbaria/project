import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { DBState, UserProfile, Booking, Message, Review, AppNotification, ProgressTrack } from './src/types';

// Ensure dotenv is configured
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 3000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Map to track user registrations: userId -> socket.id
const userSockets = new Map<string, string>();

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Register user ID
  socket.on('register', (userId: string) => {
    if (userId) {
      userSockets.set(userId, socket.id);
      console.log(`User registered: ${userId} -> ${socket.id}`);
      // Broadcast that this user is online
      io.emit('user-online-status', { userId, status: 'online' });
    }
  });

  // Call user
  socket.on('call-user', ({ to, offer, from, callerName, callerAvatar }) => {
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming-call', {
        from,
        offer,
        callerName,
        callerAvatar
      });
      console.log(`Signaling: Call offer from ${from} to ${to}`);
    } else {
      socket.emit('call-failed', { reason: 'User offline' });
      console.log(`Signaling: Call offer from ${from} to offline user ${to}`);
    }
  });

  // Answer call
  socket.on('make-answer', ({ to, answer }) => {
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-answered', {
        answer
      });
      console.log(`Signaling: Answer from client to ${to}`);
    }
  });

  // Reject call
  socket.on('reject-call', ({ to }) => {
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-rejected');
      console.log(`Signaling: Call rejected by user of target ${to}`);
    }
  });

  // ICE candidates
  socket.on('ice-candidate', ({ to, candidate }) => {
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', {
        candidate
      });
    }
  });

  // End call
  socket.on('end-call', ({ to }) => {
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-ended');
      console.log(`Signaling: Call ended notification sent to ${to}`);
    }
  });

  // Check if a specific user is online
  socket.on('check-online', ({ userId }, callback) => {
    const isOnline = userSockets.has(userId);
    if (callback) callback({ isOnline });
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        io.emit('user-online-status', { userId, status: 'offline' });
        console.log(`User unregistered due to disconnect: ${userId}`);
        break;
      }
    }
  });
});
const DB_FILE_PATH = path.join(process.cwd(), 'data', 'database.json');

app.use(express.json());

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
} else {
  console.warn("WARNING: GEMINI_API_KEY is not defined. AI recommendations will fall back to mock generation.");
}

// Ensure the data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Seed Data
const initialUsers: UserProfile[] = [
  {
    id: 'user-alex',
    name: 'Alex Rivera',
    email: 'alex.rivera@example.com',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80',
    bio: 'Full Stack Engineer with 5+ years of experience. Love teaching React and Python while learning design and languages.',
    education: 'B.S. in Computer Science, UC Berkeley',
    experience: 'Senior Developer at TechCorp, former Frontend engineer at StartupX',
    languages: ['English', 'Spanish (Intermediate)'],
    availability: ['Afternoon', 'Evening'],
    skillLevel: 'Expert',
    portfolio: {
      github: 'https://github.com',
      linkedin: 'https://linkedin.com'
    },
    skillsOffered: [
      { name: 'Python Programming', category: 'Programming', level: 'Expert' },
      { name: 'React Frontend Development', category: 'Programming', level: 'Expert' }
    ],
    skillsWanted: [
      { name: 'Spanish Conversation', category: 'Language Learning', level: 'Beginner' },
      { name: 'UI/UX Design', category: 'Graphic Design', level: 'Intermediate' }
    ],
    rating: 4.9,
    reviewsCount: 18,
    successfulExchanges: 24,
    credits: 5,
    timeZone: 'EST',
    badges: [
      { id: 'b1', name: 'Master Teacher', icon: 'Award', description: 'Taught over 15 highly rated sessions', dateEarned: '2026-05-15' },
      { id: 'b2', name: 'Code Ninja', icon: 'Cpu', description: 'Completed 10 programming exchanges', dateEarned: '2026-06-01' }
    ]
  },
  {
    id: 'user-sofia',
    name: 'Sofia Chen',
    email: 'sofia.chen@example.com',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80',
    bio: 'Lead Graphic Designer specializing in brand identity and mobile app interfaces. Keen to learn Python for automation.',
    education: 'B.F.A in Graphic Design, Rhode Island School of Design',
    experience: 'Lead Designer at StudioCreative, former UI Designer at MobileFirst',
    languages: ['English', 'Mandarin (Native)'],
    availability: ['Morning', 'Evening'],
    skillLevel: 'Expert',
    portfolio: {
      behance: 'https://behance.net',
      linkedin: 'https://linkedin.com'
    },
    skillsOffered: [
      { name: 'Figma UI/UX Design', category: 'Graphic Design', level: 'Expert' },
      { name: 'Brand Identity', category: 'Graphic Design', level: 'Expert' }
    ],
    skillsWanted: [
      { name: 'Python Programming', category: 'Programming', level: 'Beginner' },
      { name: 'Sourdough Baking', category: 'Cooking', level: 'Beginner' }
    ],
    rating: 4.8,
    reviewsCount: 14,
    successfulExchanges: 19,
    credits: 4,
    timeZone: 'PST',
    badges: [
      { id: 'b3', name: 'Pixel Perfect', icon: 'Palette', description: 'Gave amazing UI feedback in 10 sessions', dateEarned: '2026-04-10' }
    ]
  },
  {
    id: 'user-marcus',
    name: 'Marcus Vance',
    email: 'marcus.vance@example.com',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80',
    bio: 'Professional video editor and motion graphic artist. Content creator with 100k+ subscribers.',
    education: 'B.A. in Film and Digital Media, NYU',
    experience: 'Video Producer at MediaHouse, freelance YouTuber',
    languages: ['English'],
    availability: ['Morning', 'Afternoon'],
    skillLevel: 'Expert',
    portfolio: {
      behance: 'https://behance.net',
      portfolioUrl: 'https://youtube.com'
    },
    skillsOffered: [
      { name: 'Adobe Premiere Editing', category: 'Video Editing', level: 'Expert' },
      { name: 'After Effects Animation', category: 'Video Editing', level: 'Expert' }
    ],
    skillsWanted: [
      { name: 'SEO & Copywriting', category: 'Digital Marketing', level: 'Intermediate' },
      { name: 'Public Speaking', category: 'Public Speaking', level: 'Beginner' }
    ],
    rating: 4.7,
    reviewsCount: 11,
    successfulExchanges: 15,
    credits: 6,
    timeZone: 'GMT',
    badges: [
      { id: 'b4', name: 'Director Eye', icon: 'Film', description: 'Edited over 10 project sessions', dateEarned: '2026-03-20' }
    ]
  },
  {
    id: 'user-elena',
    name: 'Elena Rostova',
    email: 'elena.rostova@example.com',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80',
    bio: 'Language instructor and translator. Passionate about music, linguistics, and exploring local cuisines.',
    education: 'M.A. in Applied Linguistics, Moscow State University',
    experience: 'Language Specialist at LinguaSchool, Online Coach for 4+ years',
    languages: ['Russian (Native)', 'English (Fluent)', 'French (Intermediate)'],
    availability: ['Morning', 'Afternoon', 'Evening'],
    skillLevel: 'Expert',
    portfolio: {
      linkedin: 'https://linkedin.com'
    },
    skillsOffered: [
      { name: 'Russian Language', category: 'Language Learning', level: 'Expert' },
      { name: 'French Conversation', category: 'Language Learning', level: 'Intermediate' }
    ],
    skillsWanted: [
      { name: 'Figma UI/UX Design', category: 'Graphic Design', level: 'Beginner' },
      { name: 'Acoustic Guitar', category: 'Music', level: 'Beginner' }
    ],
    rating: 5.0,
    reviewsCount: 22,
    successfulExchanges: 30,
    credits: 8,
    timeZone: 'CET',
    badges: [
      { id: 'b5', name: 'Polyglot', icon: 'Languages', description: 'Taught classes in multiple languages', dateEarned: '2026-02-12' },
      { id: 'b6', name: 'Five-Star Legend', icon: 'Sparkles', description: 'Maintained a perfect 5.0 rating over 20+ reviews', dateEarned: '2026-05-30' }
    ]
  },
  {
    id: 'user-david',
    name: 'David Miller',
    email: 'david.miller@example.com',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80',
    bio: 'Business consultant and public speaker. Helping entrepreneurs pitch their ideas successfully to investors.',
    education: 'MBA, Harvard Business School',
    experience: 'Partner at MillerConsulting, ex-Venture Capital Analyst',
    languages: ['English'],
    availability: ['Afternoon', 'Evening'],
    skillLevel: 'Expert',
    portfolio: {
      linkedin: 'https://linkedin.com',
      portfolioUrl: 'https://davidmiller.consulting'
    },
    skillsOffered: [
      { name: 'Investor Pitching', category: 'Business', level: 'Expert' },
      { name: 'Public Speaking Essentials', category: 'Public Speaking', level: 'Expert' }
    ],
    skillsWanted: [
      { name: 'Landscape Photography', category: 'Photography', level: 'Beginner' },
      { name: 'Calisthenics Training', category: 'Fitness', level: 'Beginner' }
    ],
    rating: 4.6,
    reviewsCount: 9,
    successfulExchanges: 12,
    credits: 3,
    timeZone: 'CST',
    badges: [
      { id: 'b7', name: 'Keynote Master', icon: 'MessageSquare', description: 'Taught 5 successful public speaking sessions', dateEarned: '2026-01-18' }
    ]
  },
  {
    id: 'user-maya',
    name: 'Maya Patel',
    email: 'maya.patel@example.com',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&h=150&q=80',
    bio: 'Professional culinary chef and artisan baker. I demystify complex gourmet cooking for beginners!',
    education: 'Le Cordon Bleu, Paris',
    experience: 'Head Pastry Chef at BistroLeGourmet, Private Culinary Instructor',
    languages: ['English', 'Hindi (Native)'],
    availability: ['Morning', 'Afternoon'],
    skillLevel: 'Expert',
    portfolio: {
      linkedin: 'https://linkedin.com',
      behance: 'https://behance.net'
    },
    skillsOffered: [
      { name: 'Gourmet French Cooking', category: 'Cooking', level: 'Expert' },
      { name: 'Sourdough Baking', category: 'Cooking', level: 'Expert' }
    ],
    skillsWanted: [
      { name: 'Adobe Premiere Editing', category: 'Video Editing', level: 'Beginner' },
      { name: 'SEO & Copywriting', category: 'Digital Marketing', level: 'Beginner' }
    ],
    rating: 4.9,
    reviewsCount: 16,
    successfulExchanges: 21,
    credits: 7,
    timeZone: 'IST',
    badges: [
      { id: 'b8', name: 'Michelin Mentor', icon: 'Flame', description: 'Guided 15 students through complex recipes', dateEarned: '2026-04-22' }
    ]
  },
  {
    id: 'user-liam',
    name: 'Liam Connor',
    email: 'liam.connor@example.com',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&h=150&q=80',
    bio: 'Professional singer-songwriter and acoustic guitarist. Let me teach you how to play your favorite songs and understand basic music theory, from fingerpicking to open tunings!',
    education: 'B.M. in Guitar Performance, Berklee College of Music',
    experience: 'Guitar Instructor at Boston Music Academy, touring solo acoustic artist',
    languages: ['English'],
    availability: ['Afternoon', 'Evening'],
    skillLevel: 'Expert',
    portfolio: {
      linkedin: 'https://linkedin.com'
    },
    skillsOffered: [
      { name: 'Acoustic Guitar Basics', category: 'Music', level: 'Expert' },
      { name: 'Songwriting & Chord Theory', category: 'Music', level: 'Expert' }
    ],
    skillsWanted: [
      { name: 'French Conversation', category: 'Language Learning', level: 'Beginner' },
      { name: 'Sourdough Baking', category: 'Cooking', level: 'Beginner' }
    ],
    rating: 4.9,
    reviewsCount: 15,
    successfulExchanges: 20,
    credits: 4,
    timeZone: 'EST',
    badges: [
      { id: 'b-liam-1', name: 'Melody Maker', icon: 'Music', description: 'Taught 10+ acoustic guitar sessions with stellar feedback', dateEarned: '2026-04-12' }
    ]
  },
  {
    id: 'user-yuki',
    name: 'Yuki Tanaka',
    email: 'yuki.tanaka@example.com',
    avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=150&h=150&q=80',
    bio: 'Award-winning travel and landscape photographer. I can teach you the rules of composition, camera settings, manual shooting, and post-processing in Lightroom!',
    education: 'B.A. in Photography, Tokyo University of the Arts',
    experience: 'Freelance editorial photographer for travel magazines, Lightroom workshop leader',
    languages: ['Japanese (Native)', 'English (Fluent)'],
    availability: ['Morning', 'Afternoon'],
    skillLevel: 'Expert',
    portfolio: {
      behance: 'https://behance.net',
      portfolioUrl: 'https://yukitanaka.photography'
    },
    skillsOffered: [
      { name: 'Landscape Photography', category: 'Photography', level: 'Expert' },
      { name: 'Lightroom Post-Processing', category: 'Photography', level: 'Expert' }
    ],
    skillsWanted: [
      { name: 'React Frontend Development', category: 'Programming', level: 'Beginner' },
      { name: 'Investor Pitching', category: 'Business', level: 'Beginner' }
    ],
    rating: 4.8,
    reviewsCount: 12,
    successfulExchanges: 17,
    credits: 6,
    timeZone: 'JST',
    badges: [
      { id: 'b-yuki-1', name: 'Golden Hour', icon: 'Camera', description: 'Conducted 8 successful outdoor photography sessions', dateEarned: '2026-03-05' }
    ]
  },
  {
    id: 'user-zara',
    name: 'Zara Al-Farsi',
    email: 'zara.alfarsi@example.com',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=150&h=150&q=80',
    bio: 'Digital marketing strategist and senior copywriter. Expert in keyword research, SEO strategy, and writing high-converting landing pages.',
    education: 'B.A. in English & Communications, McGill University',
    experience: 'Senior Content Strategist at GrowthMarketers, Freelance Copywriter',
    languages: ['Arabic (Native)', 'English (Fluent)', 'French (Intermediate)'],
    availability: ['Evening'],
    skillLevel: 'Expert',
    portfolio: {
      linkedin: 'https://linkedin.com'
    },
    skillsOffered: [
      { name: 'SEO & Copywriting', category: 'Digital Marketing', level: 'Expert' },
      { name: 'Email Marketing Strategy', category: 'Digital Marketing', level: 'Expert' }
    ],
    skillsWanted: [
      { name: 'Calisthenics Training', category: 'Fitness', level: 'Beginner' },
      { name: 'Adobe Premiere Editing', category: 'Video Editing', level: 'Beginner' }
    ],
    rating: 4.9,
    reviewsCount: 8,
    successfulExchanges: 11,
    credits: 5,
    timeZone: 'AST',
    badges: [
      { id: 'b-zara-1', name: 'Word Smith', icon: 'PenTool', description: 'Improved copy quality in 5 community websites', dateEarned: '2026-05-18' }
    ]
  },
  {
    id: 'user-tyler',
    name: 'Tyler Vance',
    email: 'tyler.vance@example.com',
    avatar: 'https://images.unsplash.com/photo-1500048993953-d23a436266cf?auto=format&fit=crop&w=150&h=150&q=80',
    bio: 'Certified personal trainer and calisthenics coach. Specializing in bodyweight fitness, mobility, and progressive strength overload for all levels!',
    education: 'B.S. in Kinesiology, Penn State University',
    experience: 'Head Trainer at IronBody Gym, creator of the Calisthenics Core method',
    languages: ['English'],
    availability: ['Morning', 'Evening'],
    skillLevel: 'Expert',
    portfolio: {
      linkedin: 'https://linkedin.com'
    },
    skillsOffered: [
      { name: 'Calisthenics Training', category: 'Fitness', level: 'Expert' },
      { name: 'Mobility & Flexibility Coaching', category: 'Fitness', level: 'Expert' }
    ],
    skillsWanted: [
      { name: 'Public Speaking Essentials', category: 'Public Speaking', level: 'Beginner' },
      { name: 'After Effects Animation', category: 'Video Editing', level: 'Beginner' }
    ],
    rating: 5.0,
    reviewsCount: 16,
    successfulExchanges: 22,
    credits: 3,
    timeZone: 'EST',
    badges: [
      { id: 'b-tyler-1', name: 'Iron Coach', icon: 'Dumbbell', description: 'Led 15 highly active fitness exchanges', dateEarned: '2026-02-14' }
    ]
  }
];

const initialBookings: Booking[] = [
  {
    id: 'booking-1',
    teacherId: 'user-sofia',
    teacherName: 'Sofia Chen',
    learnerId: 'user-alex',
    learnerName: 'Alex Rivera',
    skillName: 'Figma UI/UX Design',
    category: 'Graphic Design',
    learningOption: 'Live 1-on-1 Session',
    date: '2026-07-05',
    timeSlot: 'Evening',
    status: 'confirmed',
    notes: 'Please review my draft landing page design and give me layout tips!',
    createdAt: '2026-07-02T10:30:00Z'
  },
  {
    id: 'booking-2',
    teacherId: 'user-alex',
    teacherName: 'Alex Rivera',
    learnerId: 'user-sofia',
    learnerName: 'Sofia Chen',
    skillName: 'Python Programming',
    category: 'Programming',
    learningOption: 'Project-Based Learning',
    date: '2026-07-06',
    timeSlot: 'Morning',
    status: 'pending',
    notes: 'I want to build a simple script to automate renaming files in my Figma asset folders.',
    createdAt: '2026-07-03T08:15:00Z'
  }
];

const initialMessages: Message[] = [
  {
    id: 'm1',
    senderId: 'user-alex',
    receiverId: 'user-sofia',
    text: 'Hi Sofia! I requested a session to learn Figma layouts. Looking forward to it!',
    timestamp: '2026-07-02T10:31:00Z'
  },
  {
    id: 'm2',
    senderId: 'user-sofia',
    receiverId: 'user-alex',
    text: 'Hi Alex! I just accepted your booking. I would be happy to review your landing page. Can you bring a Figma link or share your screen?',
    timestamp: '2026-07-02T12:05:00Z'
  },
  {
    id: 'm3',
    senderId: 'user-alex',
    receiverId: 'user-sofia',
    text: 'Yes! I will have the screen ready. See you on Sunday.',
    timestamp: '2026-07-02T12:15:00Z'
  }
];

const initialReviews: Review[] = [
  {
    id: 'r1',
    bookingId: 'past-booking-1',
    teacherId: 'user-alex',
    learnerId: 'user-elena',
    learnerName: 'Elena Rostova',
    rating: 5,
    teachingQuality: 5,
    communication: 5,
    helpfulness: 5,
    punctuality: 5,
    comment: 'Alex explained React hooks so well! In just one hour, I understood useEffect and useState. Thank you so much!',
    createdAt: '2026-06-25T14:20:00Z'
  }
];

const initialNotifications: AppNotification[] = [
  {
    id: 'n1',
    userId: 'user-alex',
    title: 'Booking Confirmed!',
    message: 'Sofia Chen accepted your booking for Figma UI/UX Design on 2026-07-05.',
    type: 'upcoming',
    read: false,
    timestamp: '2026-07-02T12:05:00Z'
  },
  {
    id: 'n2',
    userId: 'user-sofia',
    title: 'New Booking Request',
    message: 'Alex Rivera requested a Python session on 2026-07-06.',
    type: 'request',
    read: false,
    timestamp: '2026-07-03T08:15:00Z'
  }
];

const initialProgress: ProgressTrack[] = [
  {
    userId: 'user-alex',
    skillName: 'Figma UI/UX Design',
    lessonsTotal: 5,
    lessonsCompleted: 1,
    completionPercentage: 20,
    badgesEarned: [],
    lastActive: '2026-07-02T12:15:00Z'
  }
];

// Helper to sanitize and backfill User Profiles
function sanitizeUser(user: any): UserProfile {
  return {
    id: user.id,
    name: user.name || 'Anonymous User',
    email: user.email || '',
    avatar: user.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80',
    bio: user.bio || '',
    education: user.education || 'Self-taught practitioner',
    experience: user.experience || 'Enthusiastic explorer',
    languages: Array.isArray(user.languages) ? user.languages : ['English'],
    availability: Array.isArray(user.availability) ? user.availability : ['Morning', 'Afternoon'],
    skillLevel: user.skillLevel || 'Intermediate',
    portfolio: user.portfolio || {},
    skillsOffered: Array.isArray(user.skillsOffered) ? user.skillsOffered : [],
    skillsWanted: Array.isArray(user.skillsWanted) ? user.skillsWanted : [],
    rating: typeof user.rating === 'number' ? user.rating : 5.0,
    reviewsCount: typeof user.reviewsCount === 'number' ? user.reviewsCount : 0,
    successfulExchanges: typeof user.successfulExchanges === 'number' ? user.successfulExchanges : 0,
    credits: typeof user.credits === 'number' ? user.credits : 5,
    timeZone: user.timeZone || 'EST',
    badges: Array.isArray(user.badges) ? user.badges : []
  };
}

// Helper to Load & Save DB State
function loadDB(): DBState {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const data = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(data) as DBState;
      
      // Sanitizing loaded users
      let updated = false;
      if (parsed && Array.isArray(parsed.users)) {
        const originalStr = JSON.stringify(parsed.users);
        parsed.users = parsed.users.map(sanitizeUser);
        if (JSON.stringify(parsed.users) !== originalStr) {
          updated = true;
        }
      } else if (parsed) {
        parsed.users = [];
        updated = true;
      }
      
      // Auto-merge newly added swappers if they don't exist in saved DB
      if (parsed && Array.isArray(parsed.users)) {
        initialUsers.forEach(initUser => {
          if (!parsed.users.some(u => u.id === initUser.id)) {
            parsed.users.push(sanitizeUser(initUser));
            updated = true;
          }
        });
      }
      
      if (updated) {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(parsed, null, 2));
      }
      
      return parsed;
    }
  } catch (error) {
    console.error('Error reading database file, resetting...', error);
  }

  // Seeding default database
  const defaultDB: DBState = {
    users: initialUsers.map(sanitizeUser),
    bookings: initialBookings,
    messages: initialMessages,
    reviews: initialReviews,
    notifications: initialNotifications,
    progress: initialProgress
  };
  fs.writeFileSync(DB_FILE_PATH, JSON.stringify(defaultDB, null, 2));
  return defaultDB;
}

function saveDB(state: DBState) {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error saving database file:', error);
  }
}

// REST API Endpoints

// GET /api/users - Fetch users with dynamic matching search and filters
app.get('/api/users', (req, res) => {
  const db = loadDB();
  let filtered = db.users;

  const { search, category, level, language, availability, timeZone, minRating } = req.query;

  if (search) {
    const s = (search as string).toLowerCase();
    filtered = filtered.filter(u =>
      u.name.toLowerCase().includes(s) ||
      u.bio.toLowerCase().includes(s) ||
      u.skillsOffered.some(sk => sk.name.toLowerCase().includes(s)) ||
      u.skillsWanted.some(sk => sk.name.toLowerCase().includes(s))
    );
  }

  if (category) {
    const cat = category as string;
    filtered = filtered.filter(u =>
      u.skillsOffered.some(sk => sk.category === cat) ||
      u.skillsWanted.some(sk => sk.category === cat)
    );
  }

  if (level) {
    const lvl = level as string;
    filtered = filtered.filter(u =>
      u.skillsOffered.some(sk => sk.level === lvl) ||
      u.skillLevel === lvl
    );
  }

  if (language) {
    const lang = (language as string).toLowerCase();
    filtered = filtered.filter(u =>
      u.languages.some(l => l.toLowerCase().includes(lang))
    );
  }

  if (availability) {
    const avail = availability as string;
    filtered = filtered.filter(u =>
      u.availability.includes(avail as any)
    );
  }

  if (timeZone) {
    filtered = filtered.filter(u => u.timeZone === timeZone);
  }

  if (minRating) {
    const mr = parseFloat(minRating as string);
    if (!isNaN(mr)) {
      filtered = filtered.filter(u => u.rating >= mr);
    }
  }

  res.json(filtered);
});

// GET /api/users/:id - Get a specific user profile
app.get('/api/users/:id', (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// POST /api/users - Create or update a profile
app.post('/api/users', (req, res) => {
  const db = loadDB();
  const profileData: UserProfile = req.body;

  if (!profileData.id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (!profileData.email) {
    return res.status(400).json({ error: 'Email address is required' });
  }

  // Check if someone else already has this email registered
  const emailExists = db.users.some(u => 
    u.id !== profileData.id && 
    u.email.toLowerCase().trim() === profileData.email.toLowerCase().trim()
  );

  if (emailExists) {
    return res.status(400).json({ error: 'An account already exists with this email address.' });
  }

  const index = db.users.findIndex(u => u.id === profileData.id);
  if (index >= 0) {
    // Preserve dynamic statistics
    db.users[index] = sanitizeUser({
      ...db.users[index],
      ...profileData,
      id: profileData.id // safeguard
    });
    saveDB(db);
    res.json(db.users[index]);
  } else {
    // Initialize stats for a new user
    const newUser: UserProfile = sanitizeUser({
      ...profileData,
      rating: 5.0,
      reviewsCount: 0,
      successfulExchanges: 0,
      credits: 5,
      badges: []
    });
    db.users.push(newUser);
    saveDB(db);
    res.json(newUser);
  }
});

// GET /api/bookings - Get all bookings
app.get('/api/bookings', (req, res) => {
  const db = loadDB();
  const { userId } = req.query;

  if (userId) {
    const uId = userId as string;
    const userBookings = db.bookings.filter(b => b.teacherId === uId || b.learnerId === uId);
    res.json(userBookings);
  } else {
    res.json(db.bookings);
  }
});

// POST /api/bookings - Create a booking (and consume a credit)
app.post('/api/bookings', (req, res) => {
  const db = loadDB();
  const booking: Booking = req.body;

  if (!booking.learnerId || !booking.teacherId || !booking.skillName) {
    return res.status(400).json({ error: 'Missing booking details' });
  }

  // Deduct 1 credit from learner
  const learner = db.users.find(u => u.id === booking.learnerId);
  if (!learner) {
    return res.status(404).json({ error: 'Learner profile not found' });
  }

  if (learner.credits < 1) {
    return res.status(400).json({ error: 'Insufficient credits to book this session.' });
  }

  learner.credits -= 1;
  booking.id = `booking-${Date.now()}`;
  booking.status = 'pending';
  booking.createdAt = new Date().toISOString();

  db.bookings.push(booking);

  // Add notification to Teacher
  db.notifications.push({
    id: `notif-${Date.now()}-t`,
    userId: booking.teacherId,
    title: 'New Session Request',
    message: `${booking.learnerName} wants to book a session with you for ${booking.skillName}.`,
    type: 'request',
    read: false,
    timestamp: new Date().toISOString()
  });

  // Add notification to Learner
  db.notifications.push({
    id: `notif-${Date.now()}-l`,
    userId: booking.learnerId,
    title: 'Session Requested',
    message: `You requested a session with ${booking.teacherName} for ${booking.skillName}. 1 credit reserved.`,
    type: 'credit',
    read: false,
    timestamp: new Date().toISOString()
  });

  saveDB(db);
  res.json({ booking, learnerCredits: learner.credits });
});

// PUT /api/bookings/:id/status - Update booking status
app.put('/api/bookings/:id/status', (req, res) => {
  const db = loadDB();
  const { status, notes, date, timeSlot } = req.body;
  const bookingIndex = db.bookings.findIndex(b => b.id === req.params.id);

  if (bookingIndex === -1) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const booking = db.bookings[bookingIndex];
  const oldStatus = booking.status;
  booking.status = status;

  if (notes) booking.notes = notes;
  if (date) booking.date = date;
  if (timeSlot) booking.timeSlot = timeSlot;

  // Handle core credit system and badge updates upon booking transition
  if (status === 'completed' && oldStatus !== 'completed') {
    // Teacher earns 1 credit
    const teacher = db.users.find(u => u.id === booking.teacherId);
    if (teacher) {
      teacher.credits += 1;
      teacher.successfulExchanges += 1;

      // Update progress tracker
      let progIndex = db.progress.findIndex(p => p.userId === booking.learnerId && p.skillName === booking.skillName);
      if (progIndex === -1) {
        db.progress.push({
          userId: booking.learnerId,
          skillName: booking.skillName,
          lessonsTotal: 4,
          lessonsCompleted: 1,
          completionPercentage: 25,
          badgesEarned: [],
          lastActive: new Date().toISOString()
        });
      } else {
        const prog = db.progress[progIndex];
        prog.lessonsCompleted = Math.min(prog.lessonsTotal, prog.lessonsCompleted + 1);
        prog.completionPercentage = Math.round((prog.lessonsCompleted / prog.lessonsTotal) * 100);
        prog.lastActive = new Date().toISOString();

        // Earn badge if completed
        if (prog.completionPercentage === 100 && !prog.badgesEarned.includes('grad')) {
          prog.badgesEarned.push('grad');
          // Add badge to learner profile
          const learnerUser = db.users.find(u => u.id === booking.learnerId);
          if (learnerUser && !learnerUser.badges.some(b => b.id === 'grad-badge')) {
            learnerUser.badges.push({
              id: 'grad-badge',
              name: `${booking.skillName} Grad`,
              icon: 'GraduationCap',
              description: `Successfully completed all sessions of ${booking.skillName}`,
              dateEarned: new Date().toISOString().split('T')[0]
            });
          }
        }
      }

      // Teacher reward badges
      if (teacher.successfulExchanges === 1 && !teacher.badges.some(b => b.id === 'first-swap')) {
        teacher.badges.push({
          id: 'first-swap',
          name: 'First Swap',
          icon: 'Users',
          description: 'Successfully completed first skill exchange',
          dateEarned: new Date().toISOString().split('T')[0]
        });
      }

      db.notifications.push({
        id: `notif-${Date.now()}-earn`,
        userId: booking.teacherId,
        title: 'Credits Earned!',
        message: `You earned 1 credit for completing the exchange with ${booking.learnerName}.`,
        type: 'credit',
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    db.notifications.push({
      id: `notif-${Date.now()}-comp`,
      userId: booking.learnerId,
      title: 'Session Completed!',
      message: `Your session for ${booking.skillName} is complete. Please leave a review!`,
      type: 'match',
      read: false,
      timestamp: new Date().toISOString()
    });
  } else if (status === 'cancelled' && oldStatus !== 'cancelled') {
    // Refund credit to learner
    const learner = db.users.find(u => u.id === booking.learnerId);
    if (learner) {
      learner.credits += 1;
      db.notifications.push({
        id: `notif-${Date.now()}-ref`,
        userId: booking.learnerId,
        title: 'Session Cancelled (Refunded)',
        message: `Your booking for ${booking.skillName} was cancelled. 1 credit has been returned.`,
        type: 'credit',
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    // Notify other party
    const notifierId = booking.learnerId === req.body.actionUserId ? booking.teacherId : booking.learnerId;
    const actionUserName = booking.learnerId === req.body.actionUserId ? booking.learnerName : booking.teacherName;
    db.notifications.push({
      id: `notif-${Date.now()}-canc`,
      userId: notifierId,
      title: 'Session Cancelled',
      message: `${actionUserName} cancelled the session for ${booking.skillName}.`,
      type: 'request',
      read: false,
      timestamp: new Date().toISOString()
    });
  } else if (status === 'rescheduled') {
    const notifierId = booking.learnerId === req.body.actionUserId ? booking.teacherId : booking.learnerId;
    const actionUserName = booking.learnerId === req.body.actionUserId ? booking.learnerName : booking.teacherName;
    db.notifications.push({
      id: `notif-${Date.now()}-resch`,
      userId: notifierId,
      title: 'Session Rescheduled',
      message: `${actionUserName} rescheduled the session for ${booking.skillName} to ${booking.date} (${booking.timeSlot}).`,
      type: 'upcoming',
      read: false,
      timestamp: new Date().toISOString()
    });
  } else if (status === 'confirmed' && oldStatus === 'pending') {
    db.notifications.push({
      id: `notif-${Date.now()}-conf`,
      userId: booking.learnerId,
      title: 'Booking Confirmed!',
      message: `${booking.teacherName} accepted your session for ${booking.skillName} on ${booking.date}.`,
      type: 'upcoming',
      read: false,
      timestamp: new Date().toISOString()
    });
  }

  saveDB(db);
  res.json(booking);
});

// GET /api/messages - Fetch chat log
app.get('/api/messages', (req, res) => {
  const db = loadDB();
  const { user1, user2 } = req.query;

  if (!user1 || !user2) {
    return res.status(400).json({ error: 'Missing participants' });
  }

  const conversation = db.messages.filter(
    m => (m.senderId === user1 && m.receiverId === user2) || (m.senderId === user2 && m.receiverId === user1)
  ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  res.json(conversation);
});

// POST /api/messages - Send message / handle file sharing simulation
app.post('/api/messages', (req, res) => {
  const db = loadDB();
  const message: Message = req.body;

  if (!message.senderId || !message.receiverId || !message.text) {
    return res.status(400).json({ error: 'Incomplete message payload' });
  }

  message.id = `msg-${Date.now()}`;
  message.timestamp = new Date().toISOString();

  db.messages.push(message);

  // Send a lightweight, quiet notification to the receiver
  db.notifications.push({
    id: `notif-${Date.now()}-msg`,
    userId: message.receiverId,
    title: 'New Message',
    message: `You received a message: "${message.text.substring(0, 30)}${message.text.length > 30 ? '...' : ''}"`,
    type: 'message',
    read: false,
    timestamp: new Date().toISOString()
  });

  saveDB(db);
  res.json(message);
});

// GET /api/reviews - Get reviews
app.get('/api/reviews', (req, res) => {
  const db = loadDB();
  const { teacherId } = req.query;

  if (teacherId) {
    const r = db.reviews.filter(rev => rev.teacherId === teacherId);
    res.json(r);
  } else {
    res.json(db.reviews);
  }
});

// POST /api/reviews - Post review and recalculate ratings
app.post('/api/reviews', (req, res) => {
  const db = loadDB();
  const review: Review = req.body;

  if (!review.bookingId || !review.teacherId || !review.rating) {
    return res.status(400).json({ error: 'Incomplete review data' });
  }

  review.id = `review-${Date.now()}`;
  review.createdAt = new Date().toISOString();
  db.reviews.push(review);

  // Recalculate average rating for Teacher
  const teacher = db.users.find(u => u.id === review.teacherId);
  if (teacher) {
    const teacherReviews = db.reviews.filter(r => r.teacherId === review.teacherId);
    const sum = teacherReviews.reduce((acc, curr) => acc + curr.rating, 0);
    teacher.rating = Math.round((sum / teacherReviews.length) * 10) / 10;
    teacher.reviewsCount = teacherReviews.length;
  }

  // Update booking state if needed or send notification
  db.notifications.push({
    id: `notif-${Date.now()}-rev`,
    userId: review.teacherId,
    title: 'New Review Received!',
    message: `${review.learnerName} left you a ${review.rating}-star review: "${review.comment.substring(0, 40)}..."`,
    type: 'match',
    read: false,
    timestamp: new Date().toISOString()
  });

  saveDB(db);
  res.json(review);
});

// GET /api/notifications - Get notifications
app.get('/api/notifications', (req, res) => {
  const db = loadDB();
  const { userId } = req.query;

  if (userId) {
    res.json(db.notifications.filter(n => n.userId === userId).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  } else {
    res.json(db.notifications);
  }
});

// PUT /api/notifications/:id/read - Mark notification as read
app.put('/api/notifications/:id/read', (req, res) => {
  const db = loadDB();
  const notif = db.notifications.find(n => n.id === req.params.id);
  if (notif) {
    notif.read = true;
    saveDB(db);
    res.json(notif);
  } else {
    res.status(404).json({ error: 'Notification not found' });
  }
});

// DELETE /api/notifications/:id - Delete notification
app.delete('/api/notifications/:id', (req, res) => {
  const db = loadDB();
  db.notifications = db.notifications.filter(n => n.id !== req.params.id);
  saveDB(db);
  res.json({ success: true });
});

// GET /api/progress - Get learning progress tracker
app.get('/api/progress', (req, res) => {
  const db = loadDB();
  const { userId } = req.query;

  if (userId) {
    res.json(db.progress.filter(p => p.userId === userId));
  } else {
    res.json(db.progress);
  }
});

// POST /api/recommendations - Smart Gemini AI Skill Recommendation
app.post('/api/recommendations', async (req, res) => {
  const { currentSkills, careerGoals } = req.body;

  if (!careerGoals) {
    return res.status(400).json({ error: 'Career goals are required to make suggestions' });
  }

  // Categories available on the platform
  const categoriesList = [
    'Programming', 'Graphic Design', 'Video Editing', 'Digital Marketing',
    'Photography', 'Music', 'Fitness', 'Cooking', 'Language Learning',
    'Public Speaking', 'Business'
  ];

  // System instruction for recommendations
  const prompt = `Based on the user's current skills: "${JSON.stringify(currentSkills)}"
and their career/learning goals: "${careerGoals}",
suggest exactly 3 highly relevant skills they should learn on our skill exchange website "ExchangeYourSkill".

The output MUST be a JSON array, with exactly 3 recommendations, mapping to one of these platform categories:
${JSON.stringify(categoriesList)}.

Ensure the advice is professional, highly relevant, and shows exact reasoning.`;

  try {
    if (ai) {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are a career development expert and professional skill coach for ExchangeYourSkill, a mutual skill exchange platform.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                skillName: {
                  type: Type.STRING,
                  description: "Name of the recommended skill"
                },
                category: {
                  type: Type.STRING,
                  description: "Strictly one of the platform categories"
                },
                reasoning: {
                  type: Type.STRING,
                  description: "Actionable reasoning explaining how learning this skill helps achieve their career goals"
                },
                marketDemand: {
                  type: Type.STRING,
                  description: "High-level demand or trend context (e.g., high growth, trending globally)"
                }
              },
              required: ["skillName", "category", "reasoning", "marketDemand"]
            }
          }
        }
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text.trim());
        return res.json(parsed);
      }
    }
  } catch (err) {
    console.error('Gemini API Error in recommendations:', err);
  }

  // Fallback if Gemini key is missing or failed
  const fallbackRecs = [
    {
      skillName: 'Public Speaking Essentials',
      category: 'Public Speaking',
      reasoning: 'To complement your technical skills and help you confidently pitch projects or ideas to key stakeholders.',
      marketDemand: 'Essential Leadership Skill'
    },
    {
      skillName: 'Figma UI/UX Design',
      category: 'Graphic Design',
      reasoning: 'Allows you to design beautiful wireframes and interactive prototypes, adding massive value to your software workflow.',
      marketDemand: 'Highly Demanded'
    },
    {
      skillName: 'SEO & Copywriting',
      category: 'Digital Marketing',
      reasoning: 'Gives you the copywriting power to market your products online and optimize organic search rankings.',
      marketDemand: 'High Growth Potential'
    }
  ];
  res.json(fallbackRecs);
});

// POST /api/skill-tutor - Virtual AI Skill Tutor Q&A Chat
app.post('/api/skill-tutor', async (req, res) => {
  const { skillName, category, question, history } = req.body;

  if (!skillName || !question) {
    return res.status(400).json({ error: 'Skill Name and Question are required.' });
  }

  const systemInstruction = `You are an expert AI Coach and Virtual Tutor for the skill "${skillName}" (Category: "${category}"). 
Your goal is to help the user learn this skill in a friendly, encouraging, and highly practical manner.
Provide clear step-by-step instructions, code snippets or structured exercises, common gotchas, and recommend real-world sites like W3Schools (especially for tech/marketing), MDN Web Docs, or official documentation where they can do interactive practicing.
Always keep formatting clean, using bold text, list bullet points, and markdown code blocks for readability.`;

  try {
    if (ai) {
      const contents = [];
      if (Array.isArray(history)) {
        history.forEach(h => {
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
          });
        });
      }
      
      contents.push({
        role: 'user',
        parts: [{ text: question }]
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      const text = response.text;
      if (text) {
        return res.json({ reply: text });
      }
    }
  } catch (err) {
    console.error('Gemini API Error in skill-tutor:', err);
  }

  // Robust fallback answers for key skills if Gemini is offline
  let fallbackReply = `Here is a helpful summary for learning **${skillName}**:\n\n` +
    `1. **Study Core Concepts**: Dedicate 20-30 minutes daily to understanding basic properties and standard rules.\n` +
    `2. **Leverage Quality Tutorials**: We highly recommend visiting official learning hubs or **W3Schools** for step-by-step examples.\n` +
    `3. **Build Simple Prototypes**: The best way to learn is by doing. Try creating small, hands-on exercises.\n\n` +
    `*(Note: The AI Tutor is currently in offline fallback mode, but you can explore our complete syllabus and external study links right here on this tab!)*`;

  res.json({ reply: fallbackReply });
});

// Google OAuth Authorization URL Generator
app.get('/api/auth/google/url', (req, res) => {
  const clientOrigin = (req.query.origin as string) || process.env.APP_URL || 'http://localhost:3000';
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    // If credentials are not set, return sandbox route to prevent crashing/stuck states
    return res.json({ 
      url: `/api/auth/google/sandbox?origin=${encodeURIComponent(clientOrigin)}`, 
      isSandbox: true 
    });
  }

  const redirectUri = `${clientOrigin}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: clientOrigin,
    access_type: 'offline',
    prompt: 'select_account'
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.json({ url: authUrl });
});

// Google OAuth Sandbox Page (for testing without setup)
app.get('/api/auth/google/sandbox', (req, res) => {
  const origin = (req.query.origin as string) || process.env.APP_URL || 'http://localhost:3000';
  
  res.send(`
    <html>
      <head>
        <title>Google Accounts - Sandbox Sign In</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #f0f4f9;
            color: #1f1f1f;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
          }
          .container {
            background: white;
            border-radius: 24px;
            padding: 40px;
            width: 100%;
            max-width: 440px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.08);
            box-sizing: border-box;
            text-align: center;
            border: 1px solid #e3e3e3;
          }
          .google-logo {
            width: 64px;
            height: 64px;
            margin-bottom: 16px;
          }
          h1 {
            font-size: 22px;
            font-weight: 500;
            margin: 0 0 8px 0;
            color: #1f1f1f;
            letter-spacing: -0.5px;
          }
          p.subtitle {
            font-size: 14px;
            color: #444746;
            margin: 0 0 24px 0;
          }
          .info-banner {
            background-color: #f0f4f9;
            border: 1px solid #d3e3fd;
            border-radius: 12px;
            padding: 14px;
            text-align: left;
            margin-bottom: 24px;
            font-size: 12px;
            color: #0b57d0;
            line-height: 1.5;
          }
          .info-banner strong {
            color: #0b57d0;
          }
          .account-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 24px;
          }
          .account-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            border: 1px solid #c7c7c7;
            border-radius: 100px;
            background: white;
            cursor: pointer;
            text-align: left;
            transition: background 0.15s, border-color 0.15s;
            font-size: 13px;
            font-weight: 500;
            color: #1f1f1f;
          }
          .account-item:hover {
            background-color: #f7f9fc;
            border-color: #0b57d0;
          }
          .account-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            object-fit: cover;
            border: 1px solid #e3e3e3;
          }
          .custom-form {
            border-top: 1px solid #f1f1f1;
            padding-top: 20px;
            margin-top: 20px;
            text-align: left;
          }
          .form-title {
            font-size: 13px;
            font-weight: 600;
            color: #444746;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .input-group {
            margin-bottom: 12px;
          }
          label {
            display: block;
            font-size: 11px;
            font-weight: 600;
            color: #444746;
            margin-bottom: 4px;
            text-transform: uppercase;
          }
          input {
            width: 100%;
            padding: 10px 14px;
            border: 1px solid #bcbcbc;
            border-radius: 8px;
            font-size: 13px;
            box-sizing: border-box;
            outline: none;
            transition: border-color 0.15s;
          }
          input:focus {
            border-color: #0b57d0;
          }
          .btn-submit {
            background-color: #0b57d0;
            color: white;
            border: none;
            border-radius: 100px;
            padding: 10px 24px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s;
            width: 100%;
            margin-top: 4px;
          }
          .btn-submit:hover {
            background-color: #0842a0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <svg class="google-logo" viewBox="0 0 24 24">
            <path fill="#ea4335" d="M12 5.04c1.65 0 3.14.57 4.3 1.68l3.22-3.22C17.57 1.58 14.99 1 12 1 7.42 1 3.53 3.63 1.68 7.45l3.86 3C6.46 7.69 9.02 5.04 12 5.04z"/>
            <path fill="#4285f4" d="M23.45 12.27c0-.82-.07-1.61-.21-2.38H12v4.51h6.43c-.28 1.48-1.12 2.73-2.38 3.58l3.7 2.87c2.16-2 3.7-4.94 3.7-8.58z"/>
            <path fill="#fbbc05" d="M5.54 10.45A7.12 7.12 0 0 1 5.04 12c0 .54.07 1.09.18 1.62l-3.86 3A11.89 11.89 0 0 1 1 12c0-1.74.37-3.4 1.02-4.91l3.52 3.36z"/>
            <path fill="#34a853" d="M12 18.96c-2.98 0-5.54-2.65-6.46-5.41l-3.86 3c1.85 3.82 5.74 6.45 10.32 6.45 2.94 0 5.64-1 7.68-2.73l-3.68-2.85c-1.12.76-2.5 1.14-4 1.14z"/>
          </svg>
          <h1>Choose an account</h1>
          <p class="subtitle">to continue to Skill Swap Platform</p>

          <div class="info-banner">
            <strong>Sandbox Mode Activated</strong><br/>
            Your server's <code>GOOGLE_CLIENT_ID</code> is not configured. We've launched the Sandbox so you can test Google Login immediately.
          </div>

          <div class="account-list">
            <div class="account-item" onclick="login('Sarah Miller', 'sarah.miller@gmail.com', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&amp;fit=crop&amp;w=150&amp;h=150&amp;q=80')">
              <img class="account-avatar" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&amp;fit=crop&amp;w=150&amp;h=150&amp;q=80" />
              <div>
                <div style="font-weight: 600;">Sarah Miller</div>
                <div style="font-size: 11px; color: #5f6368;">sarah.miller@gmail.com</div>
              </div>
            </div>
            <div class="account-item" onclick="login('James Lee', 'james.lee@gmail.com', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&amp;fit=crop&amp;w=150&amp;h=150&amp;q=80')">
              <img class="account-avatar" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&amp;fit=crop&amp;w=150&amp;h=150&amp;q=80" />
              <div>
                <div style="font-weight: 600;">James Lee</div>
                <div style="font-size: 11px; color: #5f6368;">james.lee@gmail.com</div>
              </div>
            </div>
          </div>

          <div class="custom-form">
            <div class="form-title">Or use custom Google details</div>
            <form onsubmit="submitCustom(event)">
              <div class="input-group">
                <label>Full Name</label>
                <input type="text" id="cust-name" placeholder="John Doe" required />
              </div>
              <div class="input-group">
                <label>Email address</label>
                <input type="email" id="cust-email" placeholder="john.doe@gmail.com" required />
              </div>
              <button type="submit" class="btn-submit">Sign In</button>
            </form>
          </div>
        </div>

        <script>
          const origin = "${origin}";
          
          function login(name, email, picture) {
            const callbackUrl = '/auth/google/callback?code=sandbox-code&state=' + encodeURIComponent(origin) + 
              '&email=' + encodeURIComponent(email) + 
              '&name=' + encodeURIComponent(name) + 
              '&picture=' + encodeURIComponent(picture);
            window.location.href = callbackUrl;
          }

          function submitCustom(e) {
            e.preventDefault();
            const name = document.getElementById('cust-name').value;
            const email = document.getElementById('cust-email').value;
            const picture = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80';
            login(name, email, picture);
          }
        </script>
      </body>
    </html>
  `);
});

// Google OAuth Callback Handler
app.get(['/auth/google/callback', '/auth/google/callback/'], async (req, res) => {
  const { code, state, email, name, picture } = req.query;
  const clientOrigin = (state as string) || process.env.APP_URL || 'http://localhost:3000';

  if (!code) {
    return res.status(400).send('Authentication code is missing from Google redirect.');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const isSandbox = code === 'sandbox-code' || !clientId || !clientSecret;

  let googleUser: {
    sub: string;
    email: string;
    name: string;
    picture?: string;
  };

  try {
    if (isSandbox) {
      googleUser = {
        sub: `sandbox-${Date.now()}`,
        email: (email as string) || 'sandbox.user@gmail.com',
        name: (name as string) || 'Sandbox User',
        picture: (picture as string) || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'
      };
    } else {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: code as string,
          client_id: clientId!,
          client_secret: clientSecret!,
          redirect_uri: `${clientOrigin}/auth/google/callback`,
          grant_type: 'authorization_code',
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      const tokenData = await tokenResponse.json() as { access_token: string };
      const accessToken = tokenData.access_token;

      const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!userResponse.ok) {
        const errorText = await userResponse.text();
        throw new Error(`Failed to fetch Google user info: ${errorText}`);
      }

      googleUser = await userResponse.json() as {
        sub: string;
        email: string;
        name: string;
        picture?: string;
      };
    }

    const db = loadDB();
    let user = db.users.find(u => u.email.toLowerCase().trim() === googleUser.email.toLowerCase().trim());

    if (!user) {
      // Create a brand new user profile
      const newUser: UserProfile = {
        id: `google-${googleUser.sub}`,
        name: googleUser.name,
        email: googleUser.email.toLowerCase().trim(),
        avatar: googleUser.picture || `https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80`,
        bio: "Excited to share my knowledge and learn from others!",
        education: "Self-Taught / Practitioner",
        experience: "Enthusiastic Skill Swapper",
        languages: ["English"],
        availability: ["Morning", "Afternoon"],
        skillLevel: "Intermediate",
        portfolio: {},
        skillsOffered: [
          { name: "Public Speaking", category: "Public Speaking", level: "Intermediate" }
        ],
        skillsWanted: [
          { name: "Spanish Conversation", category: "Language Learning", level: "Beginner" }
        ],
        rating: 5.0,
        reviewsCount: 0,
        successfulExchanges: 0,
        credits: 5,
        badges: [],
        timeZone: "EST"
      };

      db.users.push(newUser);
      saveDB(db);
      user = newUser;
    }

    // Return HTML to close popup and transmit the logged-in user profile
    res.send(`
      <html>
        <head>
          <title>Google Sign In Successful</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background-color: #f8fafc;
              color: #1e293b;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background: white;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 24px;
              text-align: center;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
              max-width: 400px;
            }
            h2 { margin-top: 0; color: #4f46e5; font-size: 18px; }
            p { font-size: 13px; color: #64748b; line-height: 1.5; }
            .spinner {
              border: 3px solid #f3f3f3;
              border-top: 3px solid #4f46e5;
              border-radius: 50%;
              width: 24px;
              height: 24px;
              animation: spin 1s linear infinite;
              margin: 16px auto;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Sign In Successful!</h2>
            <div class="spinner"></div>
            <p>Welcome back, <strong>${googleUser.name}</strong>! Syncing your profile and redirecting you back to the platform...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH_AUTH_SUCCESS',
                user: ${JSON.stringify(user)}
              }, '*');
              window.close();
            } else {
              localStorage.setItem('logged_in_user_id', '${user.id}');
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('Error during Google OAuth code exchange:', err);
    res.status(500).send(`
      <html>
        <head>
          <title>Google Sign In Error</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background-color: #f8fafc;
              color: #1e293b;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background: white;
              border: 1px solid #fca5a5;
              border-radius: 12px;
              padding: 24px;
              text-align: center;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
              max-width: 400px;
            }
            h2 { margin-top: 0; color: #dc2626; font-size: 18px; }
            p { font-size: 13px; color: #64748b; line-height: 1.5; }
            .err-code {
              background-color: #fef2f2;
              border: 1px solid #fee2e2;
              border-radius: 6px;
              padding: 10px;
              font-family: monospace;
              font-size: 11px;
              color: #b91c1c;
              text-align: left;
              word-break: break-all;
              overflow-x: auto;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Google Authentication Failed</h2>
            <p>An error occurred while exchanging the authorization code with Google's servers. Please verify that your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET match your Google Developer Console credentials.</p>
            <div class="err-code">${err.message || err}</div>
          </div>
        </body>
      </html>
    `);
  }
});

// Setup Vite Dev Server / Static Files Serve

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
