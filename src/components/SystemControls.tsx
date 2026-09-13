import React, { useState, useEffect } from "react";
import { 
  Calendar, 
  Phone, 
  Camera, 
  Users, 
  MapPin, 
  Mic, 
  Bell, 
  MessageSquare, 
  ShieldCheck,
  Smartphone,
  Wifi,
  Zap,
  Vibrate,
  Lock,
  Eye,
  Settings2,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

interface PermissionItemProps {
  icon: React.ElementType;
  title: string;
  description: string;
  status: "allowed" | "denied" | "prompt" | "unsupported";
  onToggle?: () => void;
}

const PermissionItem = ({ icon: Icon, title, description, status, onToggle }: PermissionItemProps) => {
  const getStatusColor = () => {
    switch (status) {
      case "allowed": return "text-green-400 bg-green-400/10 border-green-400/20";
      case "denied": return "text-red-400 bg-red-400/10 border-red-400/20";
      case "prompt": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
      default: return "text-zinc-500 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all group">
      <div className={cn("p-2.5 rounded-lg border", getStatusColor())}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h4 className="text-sm font-semibold text-zinc-100 truncate">{title}</h4>
          <span className={cn("text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border", getStatusColor())}>
            {status === "prompt" ? "Action Required" : status}
          </span>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">{description}</p>
      </div>
      {onToggle && status !== "unsupported" && (
        <button 
          onClick={onToggle}
          className="self-center p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

interface SystemControlsProps {
  onError?: (message: string) => void;
}

export const SystemControls = ({ onError }: SystemControlsProps) => {
  const [permissions, setPermissions] = useState<Record<string, any>>({
    microphone: "prompt",
    camera: "prompt",
    geolocation: "prompt",
    notifications: "prompt",
    contacts: "unsupported",
    vibration: "allowed",
    network: "allowed"
  });

  useEffect(() => {
    // Check initial permission states
    const checkPermissions = async () => {
      if (!navigator.permissions) return;

      const types = ["microphone", "camera", "geolocation", "notifications"];
      const newStates: any = { ...permissions };

      for (const type of types) {
        try {
          const status = await navigator.permissions.query({ name: type as any });
          newStates[type] = status.state;
          status.onchange = () => {
            setPermissions(prev => ({ ...prev, [type]: status.state }));
          };
        } catch (e) {
          console.warn(`Permission check failed for ${type}:`, e);
        }
      }

      // Check Contact Picker support
      if ("contacts" in navigator && "ContactsManager" in window) {
        newStates.contacts = "prompt";
      }

      setPermissions(newStates);
    };

    checkPermissions();
  }, []);

  const requestPermission = async (type: string) => {
    switch (type) {
      case "geolocation":
        navigator.geolocation.getCurrentPosition(
          () => setPermissions(prev => ({ ...prev, geolocation: "granted" })),
          () => setPermissions(prev => ({ ...prev, geolocation: "denied" }))
        );
        break;
      case "notifications":
        const result = await Notification.requestPermission();
        setPermissions(prev => ({ ...prev, notifications: result }));
        break;
      case "vibration":
        navigator.vibrate(200);
        break;
      case "contacts":
        try {
          const props = ["name", "email", "tel"];
          const opts = { multiple: false };
          await (navigator as any).contacts.select(props, opts);
          setPermissions(prev => ({ ...prev, contacts: "granted" }));
        } catch (e) {
          console.error("Contact picker failed:", e);
          if (e instanceof Error && e.message.includes("top frame")) {
            // This is a known restriction in iframes (like the AI Studio preview)
            onError?.("The Contact Picker can only be used in the top-level window. Please open Zoya in a new tab to use this feature.");
          }
        }
        break;
    }
  };

  return (
    <div className="space-y-8 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-6 h-6 text-pink-500" />
        <div>
          <h3 className="text-lg font-bold uppercase italic tracking-tight">Zoya's System Access</h3>
          <p className="text-xs text-zinc-500">Manage what Zoya can see, hear, and control.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Real Permissions */}
        <PermissionItem 
          icon={Mic}
          title="Microphone"
          description="Required for voice-to-voice conversation. Zoya needs to hear your beautiful voice."
          status={permissions.microphone === "granted" ? "allowed" : permissions.microphone === "denied" ? "denied" : "prompt"}
        />
        <PermissionItem 
          icon={Camera}
          title="Camera"
          description="Allows Zoya to see you through your webcam for visual context."
          status={permissions.camera === "granted" ? "allowed" : permissions.camera === "denied" ? "denied" : "prompt"}
        />
        <PermissionItem 
          icon={MapPin}
          title="Location"
          description="Zoya can provide local recommendations and weather based on where you are."
          status={permissions.geolocation === "granted" ? "allowed" : permissions.geolocation === "denied" ? "denied" : "prompt"}
          onToggle={() => requestPermission("geolocation")}
        />
        <PermissionItem 
          icon={Bell}
          title="Notifications"
          description="Let Zoya send you sassy alerts even when you're not looking at her."
          status={permissions.notifications === "granted" ? "allowed" : permissions.notifications === "denied" ? "denied" : "prompt"}
          onToggle={() => requestPermission("notifications")}
        />

        {/* Advanced / Mock Permissions to match user screenshots */}
        <PermissionItem 
          icon={Calendar}
          title="Calendar"
          description="Read calendar events and details. (Requires Google/Outlook Sync)"
          status="prompt"
        />
        <PermissionItem 
          icon={Phone}
          title="Call Logs & Phone"
          description="Read phone status, identity, and call history. (Limited on Web)"
          status="denied"
        />
        <PermissionItem 
          icon={Users}
          title="Contacts"
          description="Access your contact list to help you reach out to friends."
          status={permissions.contacts === "granted" ? "allowed" : permissions.contacts === "unsupported" ? "unsupported" : "prompt"}
          onToggle={() => requestPermission("contacts")}
        />
        <PermissionItem 
          icon={MessageSquare}
          title="SMS & Messages"
          description="Read and send text messages. (Requires Mobile Integration)"
          status="denied"
        />
        <PermissionItem 
          icon={Vibrate}
          title="Haptic Feedback"
          description="Control device vibration for physical alerts and feedback."
          status="allowed"
          onToggle={() => requestPermission("vibration")}
        />
        <PermissionItem 
          icon={Wifi}
          title="Network Status"
          description="Monitor Wi-Fi and cellular connectivity for optimal performance."
          status="allowed"
        />
        <PermissionItem 
          icon={Zap}
          title="Battery Optimization"
          description="Prevent Zoya from sleeping to keep the conversation going."
          status="allowed"
        />
        <PermissionItem 
          icon={Lock}
          title="Screen Lock"
          description="Ability to disable screen lock during active sessions."
          status="prompt"
        />
      </div>

      <div className="p-4 rounded-xl bg-pink-500/5 border border-pink-500/10 mt-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-pink-400 mt-0.5" />
          <div>
            <h5 className="text-sm font-semibold text-pink-200 mb-1">Privacy Note</h5>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Zoya only uses permissions to enhance your experience. Some features like SMS and Call Logs are restricted by browser security policies and require a native mobile app for full functionality.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
