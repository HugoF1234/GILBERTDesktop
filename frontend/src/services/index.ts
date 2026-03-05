// Central export point for all service modules
// This helps avoid circular dependencies and makes imports cleaner

export * from './templateService';
export * from './widgetTemplateService';
export * from './meetingService';
export * from './clientService';

export * from './emailService';

// Export auth and profile services separately to avoid conflicts
export { loginUser, registerUser, logoutUser, verifyTokenValidity, invalidateTokenCache, type User } from './authService';
export { getUserProfile, updateUserProfile } from './profileService';

export { default as apiClient, API_BASE_URL } from './apiClient';

