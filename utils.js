// Utility funkcije za Pelet Tracker - VERZIJA SA KUPLJENO/PRENETO I CENAMA
// DODATE FUNKCIJE ZA CENE I PRENETE ZALIHE

const DZAK_KG = 15;
const PALETA_DZAKOVA = 70;
const PALETA_KG = PALETA_DZAKOVA * DZAK_KG; // 1050 kg
const MAX_CACHE_SIZE = 100;
const MAX_SEASON_DAYS = 250;

// ========== TEMPERATURE SERVICE ==========
class TemperatureService {
    constructor() {
        this.cache = new Map();
        this.requestQueue = new Map();
        this.baseUrl = 'https://archive-api.open-meteo.com/v1/archive';
        this.maxRetries = 3;
        this.requestTimeout = 8000;
        
        this.latitude = 44.8176;
        this.longitude = 20.4569;
        
        this.monthlyAverages = {
            0: 1.4,  // Januar
            1: 3.2,  // Februar
            2: 7.8,  // Mart
            3: 13.2, // April
            4: 18.1, // Maj
            5: 21.3, // Jun
            6: 23.5, // Jul
            7: 23.4, // Avgust
            8: 18.7, // Septembar
            9: 13.5, // Oktobar
            10: 7.8, // Novembar
            11: 2.9  // Decembar
        };
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
            console.log('Greška pri čitanju iz IndexedDB:', error);
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
            console.error('Greška pri preuzimanju temperature za', date, error);
            const estimated = this.estimateTemperatureByMonth(date);
            await offlineStorage.cacheTemperature(date, estimated);
            return estimated;
        } finally {
            this.requestQueue.delete(date);
        }
    }

    async getTemperaturesForSeason(startDate, endDate) {
        const result = {};
        const datesToFetch = [];
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            
            if (this.cache.has(dateStr)) {
                result[dateStr] = this.cache.get(dateStr);
                continue;
            }
            
            try {
                const cachedTemp = await offlineStorage.getCachedTemperature(dateStr);
                if (cachedTemp !== null) {
                    result[dateStr] = cachedTemp;
                    this.cache.set(dateStr, cachedTemp);
                    continue;
                }
            } catch (error) {
                // Ignoriši greške pri čitanju iz IndexedDB
            }
            
            datesToFetch.push(dateStr);
        }
        
        if (datesToFetch.length === 0) {
            return result;
        }
        
        if (!navigator.onLine) {
            for (const dateStr of datesToFetch) {
                const estimated = this.estimateTemperatureByMonth(dateStr);
                result[dateStr] = estimated;
                this.cache.set(dateStr, estimated);
                await offlineStorage.cacheTemperature(dateStr, estimated);
            }
            return result;
        }

        const segmentSize = 30;
        const segments = [];
        
        for (let i = 0; i < datesToFetch.length; i += segmentSize) {
            const segmentDates = datesToFetch.slice(i, i + segmentSize);
            if (segmentDates.length > 0) {
                segments.push({
                    start: segmentDates[0],
                    end: segmentDates[segmentDates.length - 1],
                    dates: segmentDates
                });
            }
        }
        
        for (const segment of segments) {
            try {
                const segmentTemps = await this.fetchTemperatureSegment(segment.start, segment.end);
                
                for (const dateStr of segment.dates) {
                    if (segmentTemps[dateStr] !== undefined) {
                        result[dateStr] = segmentTemps[dateStr];
                        this.cache.set(dateStr, segmentTemps[dateStr]);
                        await offlineStorage.cacheTemperature(dateStr, segmentTemps[dateStr]);
                    } else {
                        const estimated = this.estimateTemperatureByMonth(dateStr);
                        result[dateStr] = estimated;
                        this.cache.set(dateStr, estimated);
                        await offlineStorage.cacheTemperature(dateStr, estimated);
                    }
                }
            } catch (error) {
                console.error('Greška pri preuzimanju segmenta:', error);
                for (const dateStr of segment.dates) {
                    const estimated = this.estimateTemperatureByMonth(dateStr);
                    result[dateStr] = estimated;
                    this.cache.set(dateStr, estimated);
                    await offlineStorage.cacheTemperature(dateStr, estimated);
                }
            }
        }
        
        return result;
    }

    async fetchTemperatureSegment(startDate, endDate) {
        try {
            const params = new URLSearchParams({
                latitude: this.latitude,
                longitude: this.longitude,
                start_date: startDate,
                end_date: endDate,
                daily: 'temperature_2m_mean',
                timezone: 'Europe/Belgrade'
            });
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
            
            const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP greška: ${response.status}`);
            }
            
            const data = await response.json();
            
            const temperatures = {};
            
            if (data.daily && data.daily.time && data.daily.temperature_2m_mean) {
                for (let i = 0; i < data.daily.time.length; i++) {
                    const date = data.daily.time[i];
                    const temp = data.daily.temperature_2m_mean[i];
                    
                    if (temp !== null && temp !== undefined) {
                        temperatures[date] = Math.round(temp * 10) / 10;
                    }
                }
            }
            
            return temperatures;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Prekid zahteva - timeout');
            }
            throw error;
        }
    }

    async fetchTemperatureWithRetry(date, retryCount = 0) {
        if (!navigator.onLine) {
            throw new Error('Offline mod');
        }

        try {
            const params = new URLSearchParams({
                latitude: this.latitude,
                longitude: this.longitude,
                start_date: date,
                end_date: date,
                daily: 'temperature_2m_mean',
                timezone: 'Europe/Belgrade'
            });

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
            
            const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP greška: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.daily && data.daily.temperature_2m_mean && data.daily.temperature_2m_mean[0] !== undefined) {
                const temp = data.daily.temperature_2m_mean[0];
                return Math.round(temp * 10) / 10;
            }
            
            throw new Error('Nema podataka o temperaturi');
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log(`Timeout za datum ${date}, pokušaj ${retryCount + 1}`);
            }
            
            if (retryCount < this.maxRetries && navigator.onLine) {
                const delayMs = 1000 * Math.pow(2, retryCount);
                await this.delay(delayMs);
                return this.fetchTemperatureWithRetry(date, retryCount + 1);
            }
            
            throw error;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    estimateTemperatureByMonth(dateStr) {
        const date = new Date(dateStr);
        const month = date.getMonth();
        
        let baseTemp = this.monthlyAverages[month] || 10;
        const variation = (Math.random() * 4) - 2;
        
        return Math.round((baseTemp + variation) * 10) / 10;
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

    async updateSeasonTemperatures(season) {
        if (!season || !season.period || !season.period.start || !season.period.end) {
            console.error('Nepotpuni podaci sezone');
            return season;
        }
        
        const datumiBezTemperature = [];
        
        for (const [datum, podatak] of Object.entries(season.days)) {
            if (podatak.temperatura === undefined || podatak.temperatura === null || podatak.temperatura === 0) {
                datumiBezTemperature.push(datum);
            }
        }
        
        if (datumiBezTemperature.length === 0) {
            console.log('Svi datumi već imaju temperature');
            return season;
        }
        
        console.log(`Preuzimam temperature za ${datumiBezTemperature.length} dana`);
        
        const temperatures = await this.getTemperaturesForSeason(season.period.start, season.period.end);
        
        let updatedCount = 0;
        
        for (const datum of datumiBezTemperature) {
            if (temperatures[datum] !== undefined) {
                if (!season.days[datum]) {
                    season.days[datum] = {
                        potrosnja: 0,
                        temperatura: 0,
                        createdAt: new Date().toISOString()
                    };
                }
                season.days[datum].temperatura = temperatures[datum];
                season.days[datum].updatedAt = new Date().toISOString();
                updatedCount++;
            }
        }
        
        console.log(`Ažurirano ${updatedCount} temperatura`);
        season.meta.updatedAt = new Date().toISOString();
        
        return season;
    }

    clearCache() {
        this.cache.clear();
        this.requestQueue.clear();
    }

    getCacheSize() {
        return this.cache.size;
    }
}

// ========== DATA MANAGER - IZMENJEN ZA NOVU STRUKTURU ==========
class DataManager {
    constructor() {
        this.storageKey = 'pelet_tracker_data_v4';
        this.dataVersion = '4.0';
        this.maxStorageSize = 5 * 1024 * 1024;
        this.state = null;
    }

    loadData() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) {
                this.state = this.createEmptyState();
                return this.state;
            }

            const parsed = JSON.parse(stored);
            
            if (parsed.version !== this.dataVersion) {
                this.state = this.migrateData(parsed);
            } else {
                this.state = parsed;
            }
            
            return this.state;
        } catch (error) {
            console.error('Error loading data:', error);
            this.createBackup('load_error');
            this.state = this.createEmptyState();
            return this.state;
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
        
        // Migracija iz stare verzije (v3) u novu (v4) sa kupljeno/preneto strukturom
        if (oldData.seasons) {
            Object.entries(oldData.seasons).forEach(([seasonId, oldSeason]) => {
                const potrosnja = Object.values(oldSeason.days || {}).reduce((sum, dan) => sum + (dan.potrosnja || 0), 0);
                
                migratedState.seasons[seasonId] = {
                    id: oldSeason.id,
                    naziv: oldSeason.naziv || oldSeason.id,
                    period: {
                        start: oldSeason.period?.start || oldSeason.pocetniDatum,
                        end: oldSeason.period?.end || oldSeason.krajDatum
                    },
                    // NOVA STRUKTURA ZA ZALIHE
                    zalihe: {
                        kupljeno: oldSeason.pocetnaKolicina || 0,
                        preneto: 0,
                        cena: {
                            poTon: 0,
                            poPaleti: 0,
                            valuta: 'RSD'
                        }
                    },
                    days: oldSeason.days || {},
                    meta: {
                        createdAt: oldSeason.meta?.createdAt || new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    }
                };
            });
            
            if (oldData.activeSeasonId) {
                migratedState.activeSeasonId = oldData.activeSeasonId;
            }
        } else if (Array.isArray(oldData)) {
            // Stariji format
            oldData.forEach(oldSeason => {
                migratedState.seasons[oldSeason.id] = {
                    id: oldSeason.id,
                    naziv: oldSeason.id,
                    period: {
                        start: oldSeason.pocetniDatum,
                        end: oldSeason.krajDatum
                    },
                    zalihe: {
                        kupljeno: oldSeason.pocetnaKolicina || 0,
                        preneto: 0,
                        cena: {
                            poTon: 0,
                            poPaleti: 0,
                            valuta: 'RSD'
                        }
                    },
                    days: {},
                    meta: {
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    }
                };
                
                // Konvertuj niz dana u objekat
                if (oldSeason.dani && Array.isArray(oldSeason.dani)) {
                    oldSeason.dani.forEach(day => {
                        if (day.datum) {
                            migratedState.seasons[oldSeason.id].days[day.datum] = {
                                potrosnja: day.potrosnja || 0,
                                temperatura: day.temperatura || 0,
                                createdAt: day.createdAt || new Date().toISOString(),
                                updatedAt: day.updatedAt || new Date().toISOString()
                            };
                        }
                    });
                }
            });
        }
        
        this.saveData(migratedState);
        return migratedState;
    }

    saveData(state) {
        try {
            this.state = state;
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
            if (window.UIHelpers) {
                UIHelpers.showAlert('Greška pri čuvanju podataka: ' + error.message, 'error');
            }
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
            } else {
                throw new Error('Nepoznat format podataka');
            }
            
            // Validacija
            Object.values(state.seasons).forEach(season => {
                if (!season.zalihe) {
                    // Ako nema novu strukturu, dodaj je
                    season.zalihe = {
                        kupljeno: season.pocetnaKolicina || 0,
                        preneto: 0,
                        cena: {
                            poTon: 0,
                            poPaleti: 0,
                            valuta: 'RSD'
                        }
                    };
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

    getCurrentSeason() {
        if (!this.state || !this.state.activeSeasonId) return null;
        return this.state.seasons[this.state.activeSeasonId] || null;
    }

    updateSeason(seasonId, updatedSeason) {
        if (this.state.seasons[seasonId]) {
            this.state.seasons[seasonId] = updatedSeason;
            this.saveData(this.state);
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
                
                const existingStart = new Date(existing.period?.start || existing.pocetniDatum);
                const existingEnd = new Date(existing.period?.end || existing.krajDatum);
                
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
            errors.push('Potrošnja je prevelika (max 100 džakova/dan)');
        }
        
        if (day.temperatura < -50 || day.temperatura > 50) {
            errors.push('Temperatura mora biti između -50 i 50°C');
        }
        
        if (isNaN(day.temperatura)) {
            errors.push('Temperatura mora biti broj');
        }
        
        return errors;
    }

    static validateCena(cena) {
        const errors = [];
        
        if (cena.poTon && (isNaN(cena.poTon) || cena.poTon < 0)) {
            errors.push('Cena po toni mora biti pozitivan broj');
        }
        
        if (cena.poPaleti && (isNaN(cena.poPaleti) || cena.poPaleti < 0)) {
            errors.push('Cena po paleti mora biti pozitivan broj');
        }
        
        return errors;
    }
}

class UIHelpers {
    static showLoading(show = true, message = 'Učitavanje...') {
        const overlay = document.getElementById('loadingOverlay');
        if (!overlay) return;
        
        if (show) {
            overlay.classList.add('active');
            overlay.setAttribute('aria-busy', 'true');
            overlay.setAttribute('aria-label', message);
            
            const spinnerText = overlay.querySelector('p');
            if (spinnerText) {
                spinnerText.textContent = message;
            }
        } else {
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

    static paletaToDzak(paleta) {
        return paleta * PALETA_DZAKOVA;
    }

    static dzakToPaleta(dzak) {
        return dzak / PALETA_DZAKOVA;
    }

    static formatBroj(num, decimals = 2) {
        const number = parseFloat(num);
        if (isNaN(number)) return '0.00';
        return number.toFixed(decimals);
    }

    static formatCena(cena, valuta = 'RSD') {
        const broj = parseFloat(cena);
        if (isNaN(broj)) return '0';
        return new Intl.NumberFormat('sr-RS').format(broj) + ' ' + valuta;
    }

    static escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static sanitizeHTML(text) {
        if (!text) return '';
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
window.DZAK_KG = DZAK_KG;
window.PALETA_DZAKOVA = PALETA_DZAKOVA;
window.PALETA_KG = PALETA_KG;

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