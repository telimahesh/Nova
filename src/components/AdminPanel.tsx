import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Activity, 
  Terminal, 
  Cpu, 
  Database, 
  Settings, 
  X, 
  BarChart3, 
  MessageSquare, 
  ShieldAlert,
  Zap,
  RefreshCw,
  Users,
  UserPlus,
  Sparkles
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { cn } from "@/lib/utils";
import { GoogleGenAI } from "@google/genai";
import { Button } from "./ui/button";
import { db } from "@/lib/firebase";
import { 
  collection, 
  setDoc, 
  doc, 
  getDocs, 
  onSnapshot,
  query, 
  where, 
  limit,
  serverTimestamp 
} from "firebase/firestore";

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  history: any[];
  sessionState: string;
  user: any;
}

const mockData = [
  { time: "09:00", requests: 12, latency: 120 },
  { time: "10:00", requests: 18, latency: 145 },
  { time: "11:00", requests: 15, latency: 130 },
  { time: "12:00", requests: 25, latency: 160 },
  { time: "13:00", requests: 30, latency: 180 },
  { time: "14:00", requests: 22, latency: 150 },
  { time: "15:00", requests: 28, latency: 170 },
];

export function AdminPanel({ isOpen, onClose, history, sessionState, user }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"monitor" | "logs" | "config" | "users">("monitor");
  const [uptime, setUptime] = useState(0);
  
  // User Creation State
  const [newUserId, setNewUserId] = useState("");
  const [newUserPass, setNewUserPass] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [worldUpdate, setWorldUpdate] = useState<string | null>(null);
  const [isFetchingWorld, setIsFetchingWorld] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  // Global Config State
  const [globalGeminiKey, setGlobalGeminiKey] = useState("");
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => {
    // Listen to global config in real-time
    const unsubscribeConfig = onSnapshot(doc(db, "config", "global"), (doc) => {
      if (doc.exists()) {
        setGlobalGeminiKey(doc.data().geminiApiKey || "");
      }
    });

    // Listen to all users in real-time
    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllUsers(usersList.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });

    return () => {
      unsubscribeConfig();
      unsubscribeUsers();
    };
  }, []);

  const handleSaveGlobalConfig = async () => {
    setIsSavingConfig(true);
    try {
      await setDoc(doc(db, "config", "global"), {
        geminiApiKey: globalGeminiKey,
        updatedAt: serverTimestamp(),
        updatedBy: user?.id || "admin"
      }, { merge: true });
      alert("Global configuration updated successfully.");
    } catch (error: any) {
      alert("Error saving config: " + error.message);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const fetchWorldUpdate = async () => {
    setIsFetchingWorld(true);
    setWorldUpdate(null);
    const key = globalGeminiKey || (process.env as any).GEMINI_API_KEY;
    
    if (!key) {
      setWorldUpdate("PROTOCOL_ERROR: CONFIGURATION REQUIRED. No API key found.");
      setIsFetchingWorld(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const prompt = "Give me a brief summary of what is happening in the world today. Focus on major global events, technology, and science. Keep it concise.";
      
      const modelsToTry = [
        "gemini-flash-latest",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
        "gemini-2.0-flash-lite-preview-02-05",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite-preview",
        "gemini-2.0-flash"
      ];

      let worldResponse = null;
      let lastError = null;

      for (const modelName of modelsToTry) {
        try {
          console.log(`Admin Syncing with ${modelName}...`);
          const result = await ai.models.generateContent({
            model: modelName,
            contents: prompt
          });
          if (result && result.text) {
            worldResponse = result.text;
            break;
          }
        } catch (e: any) {
          console.warn(`Admin sync failed with ${modelName}:`, e.message);
          lastError = e;
        }
      }

      if (worldResponse) {
        setWorldUpdate(worldResponse);
      } else {
        let cleanError = "High traffic. All sync nodes busy. Please try later.";
        if (lastError && lastError.message) {
          const msg = String(lastError.message).toLowerCase();
          if (msg.includes("429") || msg.includes("quota")) {
            cleanError = "SYSTEM CONGESTION: Quota limit reached for this session.";
          } else if (msg.includes("404")) {
            cleanError = "CONNECTIVITY ISSUE: Global sync nodes unreachable.";
          }
        }
        setWorldUpdate("PROTOCOL_ERROR: " + cleanError);
      }
    } catch (error: any) {
      let err = String(error.message);
      if (err.toLowerCase().includes("leaked")) {
        err = "SECURITY ALERT: This API key is LEAKED. You MUST generate a NEW key.";
      } else {
        try {
          const parsed = JSON.parse(err);
          err = parsed.error?.message || err;
        } catch (e) {}
      }
      setWorldUpdate("PROTOCOL_ERROR: " + err);
    } finally {
      setIsFetchingWorld(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId || !newUserPass) return;
    setIsCreatingUser(true);
    setErrorMessage(null);
    try {
      // Check if ID already exists
      const q = query(collection(db, "users"), where("id", "==", newUserId), limit(1));
      const existing = await getDocs(q);
      if (!existing.empty) {
        setErrorMessage("User ID already exists");
        return;
      }

      // Create user doc in Firestore
      const newUserRef = doc(collection(db, "users"));
      await setDoc(newUserRef, {
        id: newUserId,
        password: newUserPass,
        role: "user",
        createdAt: serverTimestamp(),
        createdBy: user?.uid
      });
      
      alert(`User ${newUserId} created successfully!`);
      setNewUserId("");
      setNewUserPass("");
    } catch (error: any) {
      setErrorMessage("Failed to create user: " + error.message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100]"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-x-0 bottom-0 top-12 bg-[#0a0a0a] border-t border-white/10 z-[101] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Admin Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-8 py-4 border-b border-white/10 bg-zinc-900/50 gap-4">
              <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto scrollbar-hide w-full sm:w-auto">
                <div className="shrink-0 flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full">
                  <ShieldAlert className="w-4 h-4 text-red-500" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-red-500 whitespace-nowrap">
                    Admin Protocol Active
                  </span>
                </div>
                <div className="h-4 w-px bg-white/10 shrink-0" />
                <div className="flex items-center gap-2 shrink-0">
                  <Terminal className="w-4 h-4 text-zinc-500" />
                  <span className="text-xs font-mono text-zinc-400">ZOYA_CORE_v1.2.4</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">System Uptime</span>
                  <span className="text-sm font-mono text-cyan-400">{formatUptime(uptime)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-zinc-500 hover:text-white hover:bg-white/10 rounded-full shrink-0"
                >
                  <X className="w-6 h-6" />
                </Button>
              </div>
            </div>

            {/* Admin Layout */}
            <div className="flex-1 flex overflow-hidden">
              {/* Sidebar Navigation */}
              <div className="w-20 sm:w-64 border-r border-white/10 flex flex-col p-2 sm:p-4 gap-2 bg-zinc-900/20">
                <button
                  onClick={onClose}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 bg-pink-500/10 text-pink-500 border border-pink-500/20 mb-4 hover:bg-pink-500/20"
                >
                  <X className="w-5 h-5" />
                  <span className="text-sm font-bold uppercase tracking-widest hidden sm:inline">Exit Admin</span>
                </button>

                <button
                  onClick={() => setActiveTab("monitor")}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group",
                    activeTab === "monitor" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  )}
                >
                  <Activity className="w-5 h-5" />
                  <span className="text-sm font-medium hidden sm:inline">System Monitor</span>
                </button>
                <button
                  onClick={() => setActiveTab("logs")}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group",
                    activeTab === "logs" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  )}
                >
                  <MessageSquare className="w-5 h-5" />
                  <span className="text-sm font-medium hidden sm:inline">Live Logs</span>
                </button>
                <button
                  onClick={() => setActiveTab("config")}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group",
                    activeTab === "config" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  )}
                >
                  <Settings className="w-5 h-5" />
                  <span className="text-sm font-medium hidden sm:inline">Core Config</span>
                </button>
                <button
                  onClick={() => setActiveTab("users")}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group",
                    activeTab === "users" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  )}
                >
                  <Users className="w-5 h-5" />
                  <span className="text-sm font-medium hidden sm:inline">User Management</span>
                </button>

                <div className="mt-auto p-4 bg-zinc-900/40 rounded-2xl border border-white/5 hidden sm:block">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono uppercase text-zinc-500">CPU Load</span>
                    <span className="text-[10px] font-mono text-cyan-400">12%</span>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      animate={{ width: "12%" }}
                      className="h-full bg-cyan-500" 
                    />
                  </div>
                  <div className="flex items-center justify-between mt-4 mb-2">
                    <span className="text-[10px] font-mono uppercase text-zinc-500">Memory</span>
                    <span className="text-[10px] font-mono text-pink-500">642MB</span>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      animate={{ width: "45%" }}
                      className="h-full bg-pink-500" 
                    />
                  </div>
                </div>
              </div>

              {/* Main Content */}
              <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
                {activeTab === "monitor" && (
                  <div className="space-y-8">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-4 gap-6">
                      {[
                        { label: "Total Requests", value: "1,284", icon: Zap, color: "text-yellow-400" },
                        { label: "Avg Latency", value: "142ms", icon: RefreshCw, color: "text-cyan-400" },
                        { label: "Active Sessions", value: "42", icon: MessageSquare, color: "text-green-400" },
                        { label: "Core Status", value: "OPTIMAL", icon: Cpu, color: "text-pink-500" },
                      ].map((stat, i) => (
                        <div key={i} className="p-6 bg-zinc-900/50 border border-white/5 rounded-3xl flex flex-col gap-4">
                          <div className="flex items-center justify-between">
                            <stat.icon className={cn("w-5 h-5", stat.color)} />
                            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Real-time</span>
                          </div>
                          <div>
                            <span className="text-2xl font-black tracking-tighter">{stat.value}</span>
                            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-1">{stat.label}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* World Awareness Section */}
                    <div className="p-8 bg-zinc-900/50 border border-white/5 rounded-3xl flex flex-col gap-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Zap className="w-5 h-5 text-yellow-400" />
                          <h3 className="text-sm font-mono uppercase tracking-widest text-zinc-400 italic">World Awareness System</h3>
                        </div>
                        <Button 
                          onClick={fetchWorldUpdate}
                          disabled={isFetchingWorld}
                          className="bg-cyan-500 hover:bg-cyan-600 text-black font-bold rounded-full px-6"
                        >
                          {isFetchingWorld ? "Fetching..." : "Run Global Scan"}
                        </Button>
                      </div>
                      
                      {worldUpdate && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-6 bg-black/40 rounded-2xl border border-white/10"
                        >
                          <p className="text-sm text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap">
                            {worldUpdate}
                          </p>
                        </motion.div>
                      )}
                    </div>

                    {/* Chart Area */}
                    <div className="grid grid-cols-2 gap-8">
                      <div className="p-8 bg-zinc-900/50 border border-white/5 rounded-3xl flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-mono uppercase tracking-widest text-zinc-400 italic">Request Volume</h3>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-cyan-500" />
                            <span className="text-[10px] font-mono text-zinc-500">Requests/hr</span>
                          </div>
                        </div>
                        <div className="h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={mockData}>
                              <defs>
                                <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                              <XAxis 
                                dataKey="time" 
                                stroke="#ffffff20" 
                                fontSize={10} 
                                tickLine={false} 
                                axisLine={false} 
                              />
                              <YAxis 
                                stroke="#ffffff20" 
                                fontSize={10} 
                                tickLine={false} 
                                axisLine={false} 
                              />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                itemStyle={{ color: '#06b6d4', fontSize: '12px' }}
                              />
                              <Area 
                                type="monotone" 
                                dataKey="requests" 
                                stroke="#06b6d4" 
                                fillOpacity={1} 
                                fill="url(#colorReq)" 
                                strokeWidth={2}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="p-8 bg-zinc-900/50 border border-white/5 rounded-3xl flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-mono uppercase tracking-widest text-zinc-400 italic">Latency Monitor</h3>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-pink-500" />
                            <span className="text-[10px] font-mono text-zinc-500">ms / request</span>
                          </div>
                        </div>
                        <div className="h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={mockData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                              <XAxis 
                                dataKey="time" 
                                stroke="#ffffff20" 
                                fontSize={10} 
                                tickLine={false} 
                                axisLine={false} 
                              />
                              <YAxis 
                                stroke="#ffffff20" 
                                fontSize={10} 
                                tickLine={false} 
                                axisLine={false} 
                              />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                itemStyle={{ color: '#ec4899', fontSize: '12px' }}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="latency" 
                                stroke="#ec4899" 
                                strokeWidth={2} 
                                dot={{ fill: '#ec4899', strokeWidth: 2, r: 4 }}
                                activeDot={{ r: 6, strokeWidth: 0 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "logs" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-sm font-mono uppercase tracking-widest text-zinc-400 italic">Live Interaction Stream</h3>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-mono text-zinc-500">Auto-scroll: ON</span>
                        <div className="h-4 w-px bg-white/10" />
                        <span className="text-[10px] font-mono text-green-500">STREAMING_ACTIVE</span>
                      </div>
                    </div>
                    
                    <div className="bg-black/40 border border-white/5 rounded-3xl p-6 font-mono text-xs space-y-3 min-h-[500px]">
                      {history.length === 0 ? (
                        <div className="text-zinc-700 italic">Waiting for incoming data...</div>
                      ) : (
                        history.map((msg, i) => (
                          <div key={i} className="flex gap-4 group">
                            <span className="text-zinc-700 shrink-0">[{msg.timestamp.toLocaleTimeString()}]</span>
                            <span className={cn(
                              "font-bold shrink-0",
                              msg.isModel ? "text-pink-500" : "text-cyan-400"
                            )}>
                              {msg.isModel ? "ZOYA:" : "USER:"}
                            </span>
                            <span className="text-zinc-300">{msg.text}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "users" && (
                  <div className="max-w-2xl space-y-8">
                    <div className="p-8 bg-zinc-900/50 border border-white/5 rounded-3xl space-y-6">
                      <div className="flex items-center gap-3 mb-2">
                        <UserPlus className="w-5 h-5 text-cyan-400" />
                        <h3 className="text-sm font-mono uppercase tracking-widest text-zinc-400 italic">Generate New User</h3>
                      </div>
                      
                      <form onSubmit={handleCreateUser} className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block ml-1">User ID</label>
                          <input 
                            type="text"
                            value={newUserId}
                            onChange={(e) => setNewUserId(e.target.value)}
                            placeholder="Enter unique ID"
                            className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-cyan-500 outline-none transition-colors"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block ml-1">Password</label>
                          <input 
                            type="text"
                            value={newUserPass}
                            onChange={(e) => setNewUserPass(e.target.value)}
                            placeholder="Enter password"
                            className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-cyan-500 outline-none transition-colors"
                          />
                        </div>

                        {errorMessage && (
                          <p className="text-xs text-red-500 font-mono">{errorMessage}</p>
                        )}

                        <Button 
                          type="submit"
                          disabled={isCreatingUser}
                          className="w-full bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl py-6 font-bold uppercase tracking-widest text-xs shadow-lg shadow-cyan-500/20"
                        >
                          {isCreatingUser ? "Generating Protocol..." : "Generate User Access"}
                        </Button>
                      </form>
                    </div>

                    <div className="p-8 bg-zinc-900/50 border border-white/5 rounded-3xl space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-mono uppercase tracking-widest text-zinc-400 italic">Active User Directory</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-cyan-400">{allUsers.length}</span>
                          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Found</span>
                        </div>
                      </div>
                      
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                        {allUsers.length === 0 ? (
                          <div className="text-center py-12 bg-black/20 rounded-2xl border border-white/5">
                            <p className="text-xs text-zinc-500 italic">No users found in directory.</p>
                          </div>
                        ) : (
                          allUsers.map((u) => (
                            <div key={u.id} className="p-4 bg-black/40 rounded-2xl border border-white/5 flex items-center justify-between group">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5">
                                  <Users className="w-5 h-5 text-zinc-500" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-zinc-200">{u.id}</span>
                                  <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                                    Role: {u.role} // Pass: {u.password?.substring(0, 1)}***
                                  </span>
                                </div>
                                {u.role === "admin" && (
                                  <div className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded-full">
                                    <span className="text-[8px] font-mono font-bold text-red-500 uppercase tracking-widest">Admin</span>
                                  </div>
                                )}
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] font-mono text-zinc-700 block uppercase">Created</span>
                                <span className="text-[10px] font-mono text-zinc-500">
                                  {u.createdAt?.toDate?.() ? u.createdAt.toDate().toLocaleDateString() : 'Pending'}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "config" && (
                  <div className="max-w-2xl space-y-8">
                    <div className="p-8 bg-zinc-900/50 border border-white/5 rounded-3xl space-y-6">
                      <div className="flex items-center gap-3 mb-2">
                        <Settings className="w-5 h-5 text-pink-500" />
                        <h3 className="text-sm font-mono uppercase tracking-widest text-zinc-400 italic">Core System Configuration</h3>
                      </div>
                      
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block ml-1">Global Gemini API Key</label>
                          <div className="flex gap-2">
                            <input 
                              type="password"
                              value={globalGeminiKey}
                              onChange={(e) => setGlobalGeminiKey(e.target.value)}
                              placeholder="AIza... (Copy the string from AI Studio)"
                              className="flex-1 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-pink-500 outline-none transition-colors"
                            />
                            <a 
                              href="https://aistudio.google.com/app/apikey" 
                              target="_blank" 
                              rel="noreferrer"
                              className="px-4 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-2xl flex items-center justify-center transition-colors group"
                              title="Get Free API Key"
                            >
                              <Sparkles className="w-4 h-4 text-pink-500 group-hover:scale-110 transition-transform" />
                            </a>
                          </div>
                          <p className="text-[10px] text-zinc-500 italic mt-2 px-1 leading-relaxed">
                            This key will be used by all users who haven't set their own personal API key. 
                            <strong> Important:</strong> The key MUST start with "AIza". If you hit quota limits, 
                            please switch to a Paid API key or use a fresh free key from AI Studio.
                          </p>
                          {!globalGeminiKey && (
                            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 animate-pulse">
                              <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Action Required: World Update Disabled</p>
                                <p className="text-[10px] text-red-500/80 italic leading-relaxed">
                                  The "World Awareness Update" feature (Long-press FAB) requires a Global API Key. 
                                  Please set a valid Gemini key here and click Save to fix this module.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-3">
                          <Button 
                            onClick={handleSaveGlobalConfig}
                            disabled={isSavingConfig}
                            className="w-full bg-pink-600 hover:bg-pink-500 text-white rounded-xl py-6 font-bold uppercase tracking-widest text-xs shadow-lg shadow-pink-500/20"
                          >
                            {isSavingConfig ? "Updating Core..." : "Save Global Configuration"}
                          </Button>
                          
                          {globalGeminiKey && (
                            <Button 
                              onClick={async () => {
                                if (confirm("Are you sure you want to reset to system default? This will delete the current Global key.")) {
                                  setIsSavingConfig(true);
                                  try {
                                    await setDoc(doc(db, "config", "global"), {
                                      geminiApiKey: "",
                                      updatedAt: serverTimestamp(),
                                      updatedBy: user?.id || "admin"
                                    }, { merge: true });
                                    setGlobalGeminiKey("");
                                    alert("Reset to system default successfully.");
                                  } catch (error: any) {
                                    alert("Error: " + error.message);
                                  } finally {
                                    setIsSavingConfig(false);
                                  }
                                }
                              }}
                              variant="ghost"
                              className="w-full text-zinc-500 hover:text-white text-[10px] uppercase tracking-widest font-mono"
                            >
                              Reset to System Default
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-8 bg-zinc-900/50 border border-white/5 rounded-3xl space-y-4">
                      <h3 className="text-sm font-mono uppercase tracking-widest text-zinc-400 italic">System Integrity</h3>
                      <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                        <span className="text-xs text-zinc-400">Auto-Scaling</span>
                        <span className="text-[10px] font-mono text-green-500">ENABLED</span>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                        <span className="text-xs text-zinc-400">Neural Proxy</span>
                        <span className="text-[10px] font-mono text-green-500">ACTIVE</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Admin Footer */}
            <div className="px-8 py-3 border-t border-white/10 bg-zinc-900/50 flex justify-between items-center">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Database: Connected</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">API: Operational</span>
                </div>
              </div>
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                © 2026 ZOYA_SYSTEMS // ALL RIGHTS RESERVED
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
