import {
    ArrowRight, Link2, GitBranch, Box, Check, X, ArrowUpRight, ArrowLeftRight, Zap, Ban, RefreshCw,
    AlertCircle, HelpCircle, Info, Anchor, Paperclip, Share2,
    ListTree, Layers, Network, Scale, Shield, Flag, Lock, Unlock,
    MoveRight, CornerDownRight, Merge, Split,
    Lightbulb, Brain, Target, Globe, BookOpen, Key, Star, Heart, ThumbsUp, ThumbsDown
} from "lucide-react";

export const SEMANTIC_ICONS: Record<string, any> = {
    // Standard Arrows
    "arrow-right": ArrowRight,
    "arrow-up-right": ArrowUpRight,
    "arrow-left-right": ArrowLeftRight,
    "move-right": MoveRight,
    "corner-down-right": CornerDownRight,

    // Functional
    "link": Link2,
    "git-branch": GitBranch,
    "merge": Merge,
    "split": Split,
    "box": Box,
    "anchor": Anchor,
    "paperclip": Paperclip,
    "share": Share2,
    "refresh-cw": RefreshCw,

    // Hierarchy & Structure
    "list-tree": ListTree,
    "layers": Layers,
    "network": Network,
    "globe": Globe,

    // Logic & Status
    "check": Check,
    "x": X,
    "ban": Ban,
    "zap": Zap,
    "alert-circle": AlertCircle,
    "help-circle": HelpCircle,
    "info": Info,
    "flag": Flag,
    "lock": Lock,
    "unlock": Unlock,

    // Concepts
    "lightbulb": Lightbulb,
    "brain": Brain,
    "target": Target,
    "book-open": BookOpen,
    "key": Key,
    "scale": Scale,
    "shield": Shield,

    // Sentiment
    "star": Star,
    "heart": Heart,
    "thumbs-up": ThumbsUp,
    "thumbs-down": ThumbsDown
};

export function getIconComponent(iconName: string | undefined) {
    if (!iconName) return ArrowRight;
    return SEMANTIC_ICONS[iconName] || ArrowRight;
}
