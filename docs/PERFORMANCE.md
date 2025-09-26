# Performance Optimization Guide

## 🚀 **Performance Overview**

This guide outlines performance optimization strategies, monitoring tools, and best practices implemented in Testify to ensure optimal user experience and system efficiency.

## 📊 **Performance Metrics**

### **Core Web Vitals**
- **Largest Contentful Paint (LCP)**: < 2.5s
- **First Input Delay (FID)**: < 100ms
- **Cumulative Layout Shift (CLS)**: < 0.1
- **First Contentful Paint (FCP)**: < 1.8s
- **Time to Interactive (TTI)**: < 3.8s

### **Bundle Size Targets**
- **Main Bundle**: < 500KB gzipped
- **Vendor Bundle**: < 800KB gzipped
- **Total Bundle**: < 1.5MB gzipped
- **Individual Chunks**: < 200KB gzipped

## 🔧 **Bundle Analysis & Optimization**

### **Analyzing Bundle Size**
```bash
# Generate bundle analysis
npm run analyze

# Build with source maps for analysis
npm run build:analyze

# Use source-map-explorer
npx source-map-explorer 'build/static/js/*.js'
```

### **Import Optimization**
```javascript
// ❌ Bad: Imports entire library
import _ from 'lodash';
import * as firebase from 'firebase/app';

// ✅ Good: Tree-shakable imports
import { debounce, throttle } from 'lodash-es';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// ❌ Bad: Imports entire icon library
import { FaUser, FaHome, FaSettings } from 'react-icons/fa';

// ✅ Good: Individual icon imports
import FaUser from 'react-icons/fa/FaUser';
import FaHome from 'react-icons/fa/FaHome';
import FaSettings from 'react-icons/fa/FaSettings';
```

### **Code Splitting Strategies**
```javascript
// Route-based code splitting
import { lazy, Suspense } from 'react';
import Loading from './components/Loading/Loading';

const AdminDashboard = lazy(() => import('./components/Dashboard/AdminDashboard/AdminDashboard'));
const TestRunner = lazy(() => import('./components/TestRunner/TestRunner'));
const UserDashboard = lazy(() => import('./components/Dashboard/UserDashboard/UserDashboard'));

// Component with suspense
const App = () => (
  <Router>
    <Routes>
      <Route 
        path="/admin" 
        element={
          <Suspense fallback={<Loading />}>
            <AdminDashboard />
          </Suspense>
        } 
      />
      <Route 
        path="/test/:testId" 
        element={
          <Suspense fallback={<Loading />}>
            <TestRunner />
          </Suspense>
        } 
      />
    </Routes>
  </Router>
);
```

### **Dynamic Imports**
```javascript
// Feature-based dynamic imports
const loadPDFExport = async () => {
  const { exportSubmissionsToPDF } = await import('../utils/pdfExport');
  return exportSubmissionsToPDF;
};

const loadExcelExport = async () => {
  const { exportSubmissionsToExcel } = await import('../utils/excelExport');
  return exportSubmissionsToExcel;
};

// Use in component
const handleExportPDF = async () => {
  setLoading(true);
  const exportToPDF = await loadPDFExport();
  await exportToPDF({ submissions, selectedTest, setLoading });
};
```

## ⚡ **React Performance Optimization**

### **Component Optimization**
```javascript
// Use React.memo for expensive components
const ExpensiveComponent = React.memo(({ data, onUpdate }) => {
  return (
    <div>
      {data.map(item => (
        <ComplexItem key={item.id} item={item} onUpdate={onUpdate} />
      ))}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function
  return prevProps.data.length === nextProps.data.length &&
         prevProps.data.every((item, index) => item.id === nextProps.data[index].id);
});

// Use useMemo for expensive calculations
const ExpensiveCalculation = ({ items }) => {
  const sortedAndFilteredItems = useMemo(() => {
    return items
      .filter(item => item.active)
      .sort((a, b) => b.score - a.score)
      .slice(0, 100);
  }, [items]);

  return <ItemList items={sortedAndFilteredItems} />;
};

// Use useCallback for stable function references
const OptimizedComponent = ({ onItemClick }) => {
  const [filter, setFilter] = useState('');
  
  const handleItemClick = useCallback((itemId) => {
    onItemClick(itemId, filter);
  }, [onItemClick, filter]);

  return <ItemList onItemClick={handleItemClick} />;
};
```

### **State Management Optimization**
```javascript
// Optimize context to prevent unnecessary re-renders
const UserContext = createContext();
const UserActionsContext = createContext();

const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  
  // Separate actions from state to prevent re-renders
  const actions = useMemo(() => ({
    updateUser: (userData) => setUser(userData),
    logout: () => setUser(null)
  }), []);

  return (
    <UserContext.Provider value={user}>
      <UserActionsContext.Provider value={actions}>
        {children}
      </UserActionsContext.Provider>
    </UserContext.Provider>
  );
};

// Use separate hooks for state and actions
const useUser = () => useContext(UserContext);
const useUserActions = () => useContext(UserActionsContext);
```

### **List Virtualization**
```javascript
// For large lists, implement virtualization
import { FixedSizeList as List } from 'react-window';

const VirtualizedSubmissionList = ({ submissions }) => {
  const Row = ({ index, style }) => (
    <div style={style}>
      <SubmissionItem submission={submissions[index]} />
    </div>
  );

  return (
    <List
      height={600}
      itemCount={submissions.length}
      itemSize={80}
      width="100%"
    >
      {Row}
    </List>
  );
};
```

## 🗄️ **Database Performance**

### **Firestore Optimization**
```javascript
// Efficient query patterns
const getSubmissionsByTest = async (testId, limit = 50) => {
  const q = query(
    collection(db, 'results'),
    where('testId', '==', testId),
    orderBy('submittedAt', 'desc'),
    limit(limit)
  );
  
  return getDocs(q);
};

// Use composite indexes for complex queries
const getFilteredSubmissions = async (testId, status, domain) => {
  // Requires composite index: testId, status, domain, submittedAt
  const q = query(
    collection(db, 'results'),
    where('testId', '==', testId),
    where('status', '==', status),
    where('domain', '==', domain),
    orderBy('submittedAt', 'desc')
  );
  
  return getDocs(q);
};

// Batch operations for better performance
const batchUpdateSubmissions = async (updates) => {
  const batch = writeBatch(db);
  
  updates.forEach(({ id, data }) => {
    const docRef = doc(db, 'results', id);
    batch.update(docRef, data);
  });
  
  await batch.commit();
};
```

### **Caching Strategies**
```javascript
// Implement client-side caching
const useSubmissionsCache = (testId) => {
  const [cache, setCache] = useState(new Map());
  
  const getSubmissions = useCallback(async (testId) => {
    if (cache.has(testId)) {
      return cache.get(testId);
    }
    
    const submissions = await fetchSubmissions(testId);
    setCache(prev => new Map(prev).set(testId, submissions));
    return submissions;
  }, [cache]);
  
  return { getSubmissions, clearCache: () => setCache(new Map()) };
};

// Use React Query for advanced caching
import { useQuery } from 'react-query';

const useSubmissions = (testId) => {
  return useQuery(
    ['submissions', testId],
    () => fetchSubmissions(testId),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false
    }
  );
};
```

## 🖼️ **Asset Optimization**

### **Image Optimization**
```javascript
// Lazy loading images
const LazyImage = ({ src, alt, ...props }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} {...props}>
      {isInView && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setIsLoaded(true)}
          style={{ opacity: isLoaded ? 1 : 0 }}
        />
      )}
    </div>
  );
};
```

### **Font Optimization**
```css
/* Preload critical fonts */
<link rel="preload" href="/fonts/primary-font.woff2" as="font" type="font/woff2" crossorigin>

/* Font display optimization */
@font-face {
  font-family: 'Primary';
  src: url('/fonts/primary-font.woff2') format('woff2');
  font-display: swap; /* Prevents invisible text during font load */
}

/* Use system fonts as fallback */
body {
  font-family: 'Primary', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

## 🔄 **Loading Performance**

### **Progressive Loading**
```javascript
// Skeleton loading for better perceived performance
const SubmissionSkeleton = () => (
  <div className="submission-skeleton">
    <div className="skeleton-line skeleton-title"></div>
    <div className="skeleton-line skeleton-text"></div>
    <div className="skeleton-line skeleton-text short"></div>
  </div>
);

const SubmissionList = () => {
  const { data: submissions, isLoading } = useSubmissions();
  
  if (isLoading) {
    return (
      <div>
        {Array.from({ length: 5 }).map((_, i) => (
          <SubmissionSkeleton key={i} />
        ))}
      </div>
    );
  }
  
  return (
    <div>
      {submissions.map(submission => (
        <SubmissionItem key={submission.id} submission={submission} />
      ))}
    </div>
  );
};
```

### **Resource Preloading**
```javascript
// Preload critical resources
const preloadCriticalResources = () => {
  // Preload critical routes
  import('./components/TestRunner/TestRunner');
  import('./components/Dashboard/AdminDashboard/AdminDashboard');
  
  // Preload critical data
  if (user?.role === 'admin') {
    queryClient.prefetchQuery(['users'], fetchUsers);
    queryClient.prefetchQuery(['tests'], fetchTests);
  }
};

// Use in app initialization
useEffect(() => {
  if (user) {
    preloadCriticalResources();
  }
}, [user]);
```

## 📱 **Mobile Performance**

### **Touch Optimization**
```css
/* Improve touch responsiveness */
.interactive-element {
  touch-action: manipulation; /* Prevents zoom on double-tap */
  -webkit-tap-highlight-color: transparent; /* Remove tap highlight */
}

/* Optimize scrolling performance */
.scrollable-container {
  -webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
  overscroll-behavior: contain; /* Prevent scroll chaining */
}
```

### **Responsive Loading**
```javascript
// Load different resources based on device capabilities
const useResponsiveResources = () => {
  const [isLowEnd, setIsLowEnd] = useState(false);
  
  useEffect(() => {
    // Detect low-end devices
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const isSlowConnection = connection && (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g');
    const isLowMemory = navigator.deviceMemory && navigator.deviceMemory < 4;
    
    setIsLowEnd(isSlowConnection || isLowMemory);
  }, []);
  
  return { isLowEnd };
};

// Use in components
const Dashboard = () => {
  const { isLowEnd } = useResponsiveResources();
  
  return (
    <div>
      {isLowEnd ? (
        <SimpleDashboard />
      ) : (
        <FullFeaturedDashboard />
      )}
    </div>
  );
};
```

## 📊 **Performance Monitoring**

### **Web Vitals Tracking**
```javascript
// Track Core Web Vitals
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

const trackWebVitals = () => {
  getCLS(console.log);
  getFID(console.log);
  getFCP(console.log);
  getLCP(console.log);
  getTTFB(console.log);
};

// Send to analytics
const sendToAnalytics = (metric) => {
  // Send to Google Analytics, Firebase Analytics, etc.
  gtag('event', metric.name, {
    event_category: 'Web Vitals',
    value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
    event_label: metric.id,
    non_interaction: true,
  });
};

// Initialize tracking
getCLS(sendToAnalytics);
getFID(sendToAnalytics);
getFCP(sendToAnalytics);
getLCP(sendToAnalytics);
getTTFB(sendToAnalytics);
```

### **Performance Budget**
```javascript
// webpack.config.js performance budget
module.exports = {
  performance: {
    maxAssetSize: 500000, // 500KB
    maxEntrypointSize: 500000, // 500KB
    hints: 'warning'
  }
};

// Package.json budget configuration
{
  "bundlesize": [
    {
      "path": "./build/static/js/*.js",
      "maxSize": "500kb"
    },
    {
      "path": "./build/static/css/*.css",
      "maxSize": "50kb"
    }
  ]
}
```

## 🔧 **Build Optimization**

### **Webpack Optimizations**
```javascript
// Custom webpack optimizations (if ejected)
module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
        firebase: {
          test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/,
          name: 'firebase',
          chunks: 'all',
        }
      }
    }
  }
};
```

### **Environment-Specific Optimizations**
```javascript
// Production optimizations
if (process.env.NODE_ENV === 'production') {
  // Disable source maps for smaller bundles
  process.env.GENERATE_SOURCEMAP = 'false';
  
  // Enable gzip compression
  process.env.REACT_APP_COMPRESS = 'true';
  
  // Disable development tools
  process.env.REACT_APP_DEVTOOLS = 'false';
}
```

## 📈 **Performance Testing**

### **Automated Performance Testing**
```bash
# Lighthouse CI
npm install -g @lhci/cli
lhci autorun

# Bundle size monitoring
npm run analyze
npm run bundlesize

# Performance regression testing
npm run test:performance
```

### **Performance Checklist**
- [ ] Bundle size under target limits
- [ ] Core Web Vitals meet thresholds
- [ ] Images optimized and lazy loaded
- [ ] Code splitting implemented
- [ ] Unused code eliminated
- [ ] Database queries optimized
- [ ] Caching strategies implemented
- [ ] Mobile performance tested
- [ ] Performance monitoring active

## 🎯 **Performance Goals**

### **Short-term Goals**
- Reduce main bundle size by 20%
- Improve LCP to under 2 seconds
- Implement route-based code splitting
- Add performance monitoring

### **Long-term Goals**
- Achieve 90+ Lighthouse performance score
- Implement service worker for caching
- Add offline functionality
- Optimize for low-end devices

---

**Performance is a feature. Monitor, measure, and optimize continuously.**
