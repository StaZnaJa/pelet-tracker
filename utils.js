// Utility funkcije za Pelet Tracker - KONAČNA RADNA VERZIJA SA PWA PODRŠKOM

const DZAK_KG = 15;
const MAX_CACHE_SIZE = 100;
const MAX_SEASON_DAYS = 250;

// ========== TEMPERATURE SERVICE - BRZA VERZIJA SA BATCH API ==========
class TemperatureService {
    constructor() {
        this.cache = new Map();
        this.requestQueue = new Map();
        this.baseUrl = 'https://api.open-meteo.com/v1/forecast';
        this.maxRetries = 2;
        this.requestTimeout = 5000;
    }

    async getTemperatureForDate(date) {
        if (this.cache.has(date)) {
            return this.cache.get(date);
        }

        try {
            const cachedTemp = await offlineStorage.getCachedTemperature(date);
            if (cachedTemp !== null) {
                this.cache.set(date, cachedTemp);
                return cachedTemp;
            }
        } catch (error) {
            console.log('Error reading from IndexedDB:', error);
        }

        if (this.requestQueue.has(date)) {
            return this.requestQueue.get(date);
        }

        const requestPromise = this.fetchTemperatureWithRetry(date);
        this.requestQueue.set(date, requestPromise);

        try {
            const temperature = await requestPromise;
            
            this.cache.set(date, temperature);
            await offlineStorage.cacheTemperature(date, temperature);
            
            if (this.cache.size > MAX_CACHE_SIZE) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
            
            return temperature;
        } catch (error) {
            console.error('Error fetching temperature for', date, error);
            const estimated = this.estimateTemperatureByMonth(date);
            await offlineStorage.cacheTemperature(date, estimated);
            return estimated;
        } finally {
            this.requestQueue.delete(date);
        }
    }

    async getTemperaturesForSeason(startDate, endDate) {
        if (!navigator.onLine) {
            return this.estimateTemperaturesForSeason(startDate, endDate);
        }

        try {
            const params = new URLSearchParams({
                latitude: '44.8176',
                longitude: '20.4569',
                start_date: startDate,
                end_date: endDate,
                daily: 'temperature_2m_max,temperature_2m_min',
                timezone: 'Europe/Belgrade',
                format: 'json'
            });

            const url = `https://api.open-meteo.com/v1/forecast?${params}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            const temperatures = {};
            
            if (data.daily && data.daily.time) {
                for (let i = 0; i < data.daily.time.length; i++) {
                    const date = data.daily.time[i];
                    const max = data.daily.temperature_2m_max[i];
                    const min = data.daily.temperature_2m_min[i];
                    const avg = ((max + min) / 2).toFixed(1);
                    
                    temperatures[date] = parseFloat(avg);
                    this.cache.set(date, parseFloat(avg));
                    await offlineStorage.cacheTemperature(date, parseFloat(avg));
                }
                
                return temperatures;
            }
            
            throw new Error('Nema podataka');
            
        } catch (error) {
            console.error('Batch temperature fetch failed:', error);
            return this.estimateTemperaturesForSeason(startDate, endDate);
        }
    }

    estimateTemperaturesForSeason(startDate, endDate) {
        const temperatures = {};
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            temperatures[dateStr] = this.estimateTemperatureByMonth(dateStr);
        }
        
        return temperatures;
    }

    async fetchTemperatureWithRetry(date, retryCount = 0) {
        if (!navigator.onLine) {
            throw new Error('Offline');
        }

        try {
            const params = new URLSearchParams({
                latitude: '44.8176',
                longitude: '20.4569',
                start_date: date,
                end_date: date,
                daily: 'temperature_2m_max,temperature_2m_min',
                timezone: 'Europe/Belgrade',
                format: 'json'
            });

            const proxyUrls = [
                'https://corsproxy.io/?',
                'https://api.allorigins.win/raw?url='
            ];
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
            
            for (const proxyBase of proxyUrls) {
                try {
                    const url = proxyBase + encodeURIComponent(`${this.baseUrl}?${params}`);
                    
                    const response = await fetch(url, {
                        headers: { 'Accept': 'application/json' },
                        signal: controller.signal
                    });

                    if (!response.ok) continue;

                    const data = await response.json();
                    
                    if (data.daily && data.daily.temperature_2m_max && data.daily.temperature_2m_max[0] !== undefined) {
                        const max = data.daily.temperature_2m_max[0];
                        const min = data.daily.temperature_2m_min[0];
                        const avg = ((max + min) / 2).toFixed(1);
                        
                        return parseFloat(avg);
                    }
                    
                } catch (error) {
                    if (error.name === 'AbortError') {
                        throw new Error('Request timeout');
                    }
                    continue;
                } finally {
                    clearTimeout(timeoutId);
                }
            }
            
            throw new Error('All proxies failed');
            
        } catch (error) {
            if (retryCount < this.maxRetries && navigator.onLine) {
                await this.delay(1000 * (retryCount + 1));
                return this.fetchTemperatureWithRetry(date, retryCount + 1);
            }
            throw error;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    estimateTemperatureByMonth(date) {
        const month = new Date(date).getMonth() + 1;
        
        const monthlyAverages = {
            1: 1.4,   2: 2.7,   3: 7.6,   4: 12.5,
            5: 17.5,  6: 20.6,  7: 22.9,  8: 22.5,
            9: 18.0, 10: 12.9, 11: 7.1,  12: 2.7
        };
        
        const estimatedTemp = monthlyAverages[month] || 10.0;
        
        this.cache.set(date, estimatedTemp);
        if (this.cache.size > MAX_CACHE_SIZE) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        return estimatedTemp;
    }

    async getTemperaturesForRange(startDate, endDate) {
        return this.getTemperaturesForSeason(startDate, endDate);
    }

    clearCache() {
        this.cache.clear();
        this.requestQueue.clear();
    }

    getCacheSize() {
        return this.cache.size;
    }
}

// ========== DATA MANAGER ==========
class DataManager {
    constructor() {
        this.storageKey = 'pelet_tracker_data_v3';
        this.dataVersion = '3.0';
        this.maxStorageSize = 5 * 1024 * 1024;
    }

    loadData() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) {
                return this.createEmptyState();
            }

            const parsed = JSON.parse(stored);
            
            if (parsed.version !== this.dataVersion) {
                return this.migrateData(parsed);
            }
            
            return parsed;
        } catch (error) {
            console.error('Error loading data:', error);
            this.createBackup('load_error');
            return this.createEmptyState();
        }
    }

    createEmptyState() {
        return {
            version: this.dataVersion,
            activeSeasonId: null,
            seasons: {}
        };
    }

    migrateData(oldData) {
        console.log('Migrating data from version', oldData.version, 'to', this.dataVersion);
        
        let migratedState = this.createEmptyState();
        
        if (Array.isArray(oldData)) {
            oldData.forEach(season => {
                const daysObj = {};
                (season.dani || []).forEach(day => {
                    daysObj[day.datum] = {
                        potrosnja: day.potrosnja || 0,
                        temperatura: day.temperatura || 0,
                        createdAt: day.createdAt || new Date().toISOString(),
                        updatedAt: day.updatedAt || new Date().toISOString()
                    };
                });
                
                migratedState.seasons[season.id] = {
                    id: season.id,
                    naziv: season.id,
                    period: {
                        start: season.pocetniDatum,
                        end: season.krajDatum
                    },
                    pocetnaKolicina: season.pocetnaKolicina || 0,
                    days: daysObj,
                    meta: {
                        createdAt: season.createdAt || new Date().toISOString(),
                        updatedAt: season.updatedAt || new Date().toISOString()
                    }
                };
            });
            
            const lastActive = localStorage.getItem('pelet_last_active');
            if (lastActive && migratedState.seasons[lastActive]) {
                migratedState.activeSeasonId = lastActive;
            }
            
        } else if (oldData.data && Array.isArray(oldData.data)) {
            oldData.data.forEach(season => {
                const daysObj = {};
                (season.dani || []).forEach(day => {
                    daysObj[day.datum] = {
                        potrosnja: day.potrosnja || 0,
                        temperatura: day.temperatura || 0,
                        createdAt: day.createdAt || new Date().toISOString(),
                        updatedAt: day.updatedAt || new Date().toISOString()
                    };
                });
                
                migratedState.seasons[season.id] = {
                    id: season.id,
                    naziv: season.id,
                    period: {
                        start: season.pocetniDatum,
                        end: season.krajDatum
                    },
                    pocetnaKolicina: season.pocetnaKolicina || 0,
                    days: daysObj,
                    meta: {
                        createdAt: season.createdAt || new Date().toISOString(),
                        updatedAt: season.updatedAt || new Date().toISOString()
                    }
                };
            });
            
            if (oldData.activeSeasonId) {
                migratedState.activeSeasonId = oldData.activeSeasonId;
            }
        } else if (oldData.seasons) {
            migratedState = {
                version: this.dataVersion,
                activeSeasonId: oldData.activeSeasonId || null,
                seasons: oldData.seasons || {}
            };
        }
        
        this.saveData(migratedState);
        return migratedState;
    }

    saveData(state) {
        try {
            const dataString = JSON.stringify(state);
            if (dataString.length > this.maxStorageSize) {
                throw new Error('Data size exceeds limit');
            }

            const storageData = {
                ...state,
                lastUpdated: new Date().toISOString()
            };
            
            localStorage.setItem(this.storageKey, JSON.stringify(storageData));
            this.createBackup('auto_backup');
            
            try {
                const backupKey = `pelet_backup_${Date.now()}`;
                const backupData = {
                    timestamp: Date.now(),
                    state: state
                };
                localStorage.setItem(backupKey, JSON.stringify(backupData));
                
                const keys = Object.keys(localStorage).filter(k => k.startsWith('pelet_backup_'));
                if (keys.length > 10) {
                    keys.sort().slice(0, keys.length - 10).forEach(k => localStorage.removeItem(k));
                }
            } catch (error) {
                console.log('Error creating offline backup:', error);
            }
            
            return true;
        } catch (error) {
            console.error('Error saving data:', error);
            UIHelpers.showAlert('Greška pri čuvanju podataka: ' + error.message, 'error');
            return false;
        }
    }

    createBackup(reason) {
        try {
            const currentData = this.loadData();
            const backup = {
                reason: reason,
                timestamp: new Date().toISOString(),
                data: currentData
            };
            
            const backups = JSON.parse(localStorage.getItem('pelet_backups') || '[]');
            backups.unshift(backup);
            
            if (backups.length > 5) {
                backups.pop();
            }
            
            localStorage.setItem('pelet_backups', JSON.stringify(backups));
        } catch (error) {
            console.error('Error creating backup:', error);
        }
    }

    exportData(state) {
        return JSON.stringify({
            version: this.dataVersion,
            exportedAt: new Date().toISOString(),
            data: state
        }, null, 2);
    }

    importData(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            
            let state;
            
            if (imported.data && imported.data.seasons) {
                state = imported.data;
            } else if (imported.data && Array.isArray(imported.data)) {
                state = this.createEmptyState();
                imported.data.forEach(oldSeason => {
                    const daysObj = {};
                    (oldSeason.dani || []).forEach(day => {
                        if (day.datum) {
                            daysObj[day.datum] = {
                                potrosnja: parseFloat(day.potrosnja) || 0,
                                temperatura: parseFloat(day.temperatura) || 0,
                                createdAt: day.createdAt || new Date().toISOString(),
                                updatedAt: day.updatedAt || new Date().toISOString()
                            };
                        }
                    });
                    
                    state.seasons[oldSeason.id] = {
                        id: oldSeason.id,
                        naziv: oldSeason.id,
                        period: {
                            start: oldSeason.pocetniDatum,
                            end: oldSeason.krajDatum
                        },
                        pocetnaKolicina: parseFloat(oldSeason.pocetnaKolicina) || 0,
                        days: daysObj,
                        meta: {
                            createdAt: oldSeason.createdAt || new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        }
                    };
                });
            } else if (Array.isArray(imported)) {
                state = this.createEmptyState();
                imported.forEach(oldSeason => {
                    const daysObj = {};
                    (oldSeason.dani || []).forEach(day => {
                        if (day.datum) {
                            daysObj[day.datum] = {
                                potrosnja: parseFloat(day.potrosnja) || 0,
                                temperatura: parseFloat(day.temperatura) || 0,
                                createdAt: day.createdAt || new Date().toISOString(),
                                updatedAt: day.updatedAt || new Date().toISOString()
                            };
                        }
                    });
                    
                    state.seasons[oldSeason.id] = {
                        id: oldSeason.id,
                        naziv: oldSeason.id,
                        period: {
                            start: oldSeason.pocetniDatum,
                            end: oldSeason.krajDatum
                        },
                        pocetnaKolicina: parseFloat(oldSeason.pocetnaKolicina) || 0,
                        days: daysObj,
                        meta: {
                            createdAt: oldSeason.createdAt || new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        }
                    };
                });
            } else {
                throw new Error('Nepoznat format podataka');
            }
            
            Object.values(state.seasons).forEach(season => {
                const errors = Validation.validateSeasonData({
                    id: season.id,
                    pocetniDatum: season.period.start,
                    krajDatum: season.period.end,
                    pocetnaKolicina: season.pocetnaKolicina
                }, Object.values(state.seasons));
                
                if (errors.length > 0) {
                    throw new Error(`Sezona ${season.id} nije validna: ${errors.join(', ')}`);
                }
            });
            
            return state;
            
        } catch (error) {
            throw new Error('Greška pri parsiranju JSON: ' + error.message);
        }
    }

    getStorageUsage() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? data.length : 0;
        } catch (error) {
            return 0;
        }
    }
}

// ========== VALIDATION I UIHelpers ==========
class Validation {
    static validateSeasonData(season, existingSeasons = []) {
        const errors = [];
        
        if (!season.id || season.id.trim() === '') {
            errors.push('Naziv sezone je obavezan');
        } else if (season.id.length > 100) {
            errors.push('Naziv sezone je predug (max 100 karaktera)');
        }
        
        if (!season.pocetniDatum) {
            errors.push('Početak sezone je obavezan');
        }
        
        if (!season.krajDatum) {
            errors.push('Kraj sezone je obavezan');
        }
        
        if (season.pocetniDatum && season.krajDatum) {
            const start = new Date(season.pocetniDatum);
            const end = new Date(season.krajDatum);
            
            if (isNaN(start.getTime())) {
                errors.push('Nevalidan početni datum');
            }
            
            if (isNaN(end.getTime())) {
                errors.push('Nevalidan krajnji datum');
            }
            
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                if (end <= start) {
                    errors.push('Kraj sezone mora biti posle početka');
                }
                
                const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                if (daysDiff > MAX_SEASON_DAYS) {
                    errors.push(`Sezona ne sme trajati duže od ${MAX_SEASON_DAYS} dana`);
                }
                
                if (daysDiff < 1) {
                    errors.push('Sezona mora trajati najmanje 1 dan');
                }
            }
        }
        
        if (isNaN(season.pocetnaKolicina) || season.pocetnaKolicina < 0) {
            errors.push('Početna količina mora biti pozitivan broj');
        }
        
        if (season.pocetnaKolicina > 10000) {
            errors.push('Početna količina je prevelika');
        }
        
        if (season.pocetniDatum && season.krajDatum) {
            const start = new Date(season.pocetniDatum);
            const end = new Date(season.krajDatum);
            
            const overlapping = existingSeasons.some(existing => {
                if (existing.id === season.id) return false;
                
                const existingStart = new Date(existing.period.start);
                const existingEnd = new Date(existing.period.end);
                
                return (start <= existingEnd && end >= existingStart);
            });
            
            if (overlapping) {
                errors.push('Sezona se preklapa sa postojećom sezonom');
            }
        }
        
        return errors;
    }

    static validateDayData(day) {
        const errors = [];
        
        if (day.potrosnja < 0) {
            errors.push('Potrošnja ne može biti negativna');
        }
        
        if (day.potrosnja > 100) {
            errors.push('Potrošnja je prevelika');
        }
        
        if (day.temperatura < -50 || day.temperatura > 50) {
            errors.push('Temperatura mora biti između -50 i 50°C');
        }
        
        if (isNaN(day.temperatura)) {
            errors.push('Temperatura mora biti broj');
        }
        
        return errors;
    }
}

class UIHelpers {
    static showLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.add('active');
            overlay.setAttribute('aria-busy', 'true');
            overlay.setAttribute('aria-label', 'Učitavanje u toku');
        }
    }

    static hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.removeAttribute('aria-busy');
        }
    }

    static showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            
            const focusableElements = modal.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            const firstFocusable = focusableElements[0];
            const lastFocusable = focusableElements[focusableElements.length - 1];
            
            if (firstFocusable) {
                setTimeout(() => firstFocusable.focus(), 100);
            }
            
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    if (e.shiftKey) {
                        if (document.activeElement === firstFocusable) {
                            e.preventDefault();
                            lastFocusable.focus();
                        }
                    } else {
                        if (document.activeElement === lastFocusable) {
                            e.preventDefault();
                            firstFocusable.focus();
                        }
                    }
                }
            });
        }
    }

    static hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }
    }

    static showAlert(message, type = 'info', duration = 3000) {
        const safeMessage = this.escapeHTML(message);
        
        const alertDiv = document.createElement('div');
        alertDiv.className = 'custom-alert';
        alertDiv.setAttribute('role', 'alert');
        alertDiv.setAttribute('aria-live', 'assertive');
        
        let bgColor, textColor, borderColor, icon;
        switch(type) {
            case 'success':
                bgColor = '#d4edda';
                textColor = '#155724';
                borderColor = '#c3e6cb';
                icon = 'check-circle';
                break;
            case 'error':
                bgColor = '#f8d7da';
                textColor = '#721c24';
                borderColor = '#f5c6cb';
                icon = 'exclamation-circle';
                break;
            case 'warning':
                bgColor = '#fff3cd';
                textColor = '#856404';
                borderColor = '#ffeaa7';
                icon = 'exclamation-triangle';
                break;
            default:
                bgColor = '#d1ecf1';
                textColor = '#0c5460';
                borderColor = '#bee5eb';
                icon = 'info-circle';
        }
        
        alertDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${bgColor};
            color: ${textColor};
            border: 1px solid ${borderColor};
            border-radius: 8px;
            z-index: 10000;
            min-width: 300px;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideInRight 0.3s ease-out;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        `;
        
        alertDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                <i class="fas fa-${icon}" style="font-size: 1.2rem;"></i>
                <span>${safeMessage}</span>
            </div>
            <button class="alert-close-btn" aria-label="Zatvori obaveštenje" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; padding: 0 0 0 10px; color: inherit;">×</button>
        `;
        
        document.body.appendChild(alertDiv);
        
        if (!document.querySelector('#alert-styles')) {
            const style = document.createElement('style');
            style.id = 'alert-styles';
            style.textContent = `
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOutRight {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        alertDiv.querySelector('.alert-close-btn').addEventListener('click', () => {
            this.hideAlert(alertDiv);
        });
        
        if (duration > 0) {
            setTimeout(() => {
                this.hideAlert(alertDiv);
            }, duration);
        }
        
        return alertDiv;
    }

    static hideAlert(alertDiv) {
        if (alertDiv && alertDiv.parentNode) {
            alertDiv.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.remove();
                }
            }, 300);
        }
    }

    static formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('sr-RS', {
                weekday: 'short',
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
        } catch (error) {
            return dateString;
        }
    }

    static kgToDzak(kg) {
        return kg / DZAK_KG;
    }

    static dzakToKg(dzak) {
        return dzak * DZAK_KG;
    }

    static formatNumber(num, decimals = 2) {
        const number = parseFloat(num);
        if (isNaN(number)) return '0.00';
        return number.toFixed(decimals);
    }

    static escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static sanitizeHTML(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    static announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = message;
        document.body.appendChild(announcement);
        
        setTimeout(() => {
            if (announcement.parentNode) {
                announcement.parentNode.removeChild(announcement);
            }
        }, 1000);
    }

    static isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    static isTouchDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
}

// ========== OFFLINE STORAGE MANAGER ==========
class OfflineStorageManager {
    constructor() {
        this.dbName = 'pelet_offline_db';
        this.dbVersion = 1;
        this.db = null;
        this.initDB();
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('failed_requests')) {
                    db.createObjectStore('failed_requests', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                }
                
                if (!db.objectStoreNames.contains('temperature_cache')) {
                    const tempStore = db.createObjectStore('temperature_cache', { 
                        keyPath: 'date' 
                    });
                    tempStore.createIndex('timestamp', 'timestamp');
                }
                
                if (!db.objectStoreNames.contains('sync_queue')) {
                    db.createObjectStore('sync_queue', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                }
            };
        });
    }

    async saveFailedRequest(url, data) {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['failed_requests'], 'readwrite');
            const store = transaction.objectStore('failed_requests');
            
            const request = store.add({
                url: url,
                data: data,
                timestamp: Date.now(),
                retries: 0
            });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getFailedRequests() {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['failed_requests'], 'readonly');
            const store = transaction.objectStore('failed_requests');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clearFailedRequest(id) {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['failed_requests'], 'readwrite');
            const store = transaction.objectStore('failed_requests');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async cacheTemperature(date, temperature) {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['temperature_cache'], 'readwrite');
            const store = transaction.objectStore('temperature_cache');
            
            const request = store.put({
                date: date,
                temperature: temperature,
                timestamp: Date.now()
            });
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getCachedTemperature(date) {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['temperature_cache'], 'readonly');
            const store = transaction.objectStore('temperature_cache');
            const request = store.get(date);
            
            request.onsuccess = () => {
                const data = request.result;
                if (data && (Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000)) {
                    resolve(data.temperature);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async addToSyncQueue(action, data) {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sync_queue'], 'readwrite');
            const store = transaction.objectStore('sync_queue');
            
            const request = store.add({
                action: action,
                data: data,
                timestamp: Date.now(),
                synced: false
            });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getSyncQueue() {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sync_queue'], 'readonly');
            const store = transaction.objectStore('sync_queue');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async markSynced(id) {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sync_queue'], 'readwrite');
            const store = transaction.objectStore('sync_queue');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// Initialize services
const temperatureService = new TemperatureService();
const dataManager = new DataManager();
const offlineStorage = new OfflineStorageManager();

// Make available globally
window.temperatureService = temperatureService;
window.dataManager = dataManager;
window.UIHelpers = UIHelpers;
window.Validation = Validation;
window.offlineStorage = offlineStorage;

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'SYNC_TEMPERATURES') {
            console.log('Background sync primljen', event.data.timestamp);
            if (window.peletTracker) {
                const season = window.peletTracker.getActiveSeason();
                if (season && Object.keys(season.days).length > 0) {
                    temperatureService.getTemperaturesForSeason(season.period.start, season.period.end)
                        .then(() => console.log('Temperature osvežene u pozadini'))
                        .catch(() => console.log('Greška pri pozadinskom osvežavanju'));
                }
            }
        }
    });
}

window.addEventListener('online', () => {
    UIHelpers.showAlert('Povezan sa internetom', 'success');
});

window.addEventListener('offline', () => {
    UIHelpers.showAlert('Nema internet veze. Neke funkcije su onemogućene.', 'warning');
});