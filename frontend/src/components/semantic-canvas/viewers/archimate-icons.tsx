import React from 'react';

// Common ArchiMate SVG Icons (standardized sizing to 16x16)

export const ActorIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <circle cx="8" cy="4" r="2.5" />
        <path d="M8 6.5v4" />
        <path d="M4 8h8" />
        <path d="M8 10.5l-3 4" />
        <path d="M8 10.5l3 4" />
    </svg>
);

export const RoleIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <path d="M2 5c0-1.66 2.69-3 6-3s6 1.34 6 3v6c0 1.66-2.69 3-6 3s-6-1.34-6-3V5z" />
        <path d="M2 5c0 1.66 2.69 3 6 3s6-1.34 6-3" />
        <path d="M5 2V8" strokeDasharray="1 1" />
    </svg>
);

export const ProcessIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <path d="M1 5h8v-3l6 6-6 6v-3h-8z" />
    </svg>
);

export const FunctionIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <path d="M6 3l6 5-6 5" />
    </svg>
);

export const EventIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <path d="M11 2c-3 0-5 2-6 5 1-1 3-2 5-2 3 0 5 2 6 5-1-1-3-2-5-2-3 0-5 2-6 5" />
        <circle cx="12" cy="8" r="3" />
    </svg>
);

export const ObjectIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <path d="M3 2h7l4 4v8H3V2z" />
        <path d="M10 2v4h4" />
    </svg>
);

export const ComponentIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <rect x="4" y="2" width="10" height="12" />
        <rect x="2" y="4" width="4" height="2" fill="white" />
        <rect x="2" y="10" width="4" height="2" fill="white" />
    </svg>
);

export const ServiceIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <path d="M4 12c-1.66 0-3-1.34-3-3s1.34-3 3-3c0-2.21 2.24-4 5-4s5 1.79 5 4c1.66 0 3 1.34 3 3s-1.34 3-3 3H4z" />
    </svg>
);

export const InterfaceIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <circle cx="12" cy="8" r="3" />
        <path d="M2 8h7" />
    </svg>
);

export const NodeIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className={className}>
        <path d="M2 5l4-3h8l-4 3z" />
        <path d="M2 5v8h8v-8" />
        <path d="M14 2v8l-4 3" />
        <path d="M10 5v8" />
    </svg>
);

export const DeviceIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <rect x="2" y="3" width="12" height="8" rx="2" />
        <path d="M6 14h4" />
        <path d="M8 11v3" />
    </svg>
);

export const GoalIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <circle cx="8" cy="8" r="6" />
        <circle cx="8" cy="8" r="3" />
        <circle cx="8" cy="8" r="1" fill="currentColor" />
    </svg>
);

export const RequirementIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <path d="M3 2l10 3v9L3 11V2z" />
    </svg>
);

export const GroupIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <path d="M2 3h4l2 2h6v8H2V3z" />
    </svg>
);

export const DefaultIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <rect x="3" y="3" width="10" height="10" />
    </svg>
);
