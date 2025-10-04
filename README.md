# 🎯 Testify - Online Testing Platform

[![CI/CD](https://github.com/your-username/testify/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/your-username/testify/actions)
[![Security](https://img.shields.io/badge/security-audited-green.svg)](https://github.com/your-username/testify/security)
[![Code Quality](https://img.shields.io/badge/code%20quality-A-brightgreen.svg)](https://github.com/your-username/testify)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A comprehensive online testing platform built with React and Firebase, featuring real-time monitoring, automated grading, and comprehensive admin controls.

## 🚀 **Features**

### **For Students**
- 🖥️ **Interactive Test Interface** with code editor support
- ⏱️ **Real-time Timer** with auto-submission
- 📊 **Instant Results** and performance analytics
- 🔒 **Secure Environment** with monitoring and anti-cheat measures
- 📱 **Responsive Design** for all devices

### **For Administrators**
- 📝 **Test Creation** with multiple question types
- 👥 **User Management** with role-based access
- 📈 **Analytics Dashboard** with detailed insights
- 📋 **Export Capabilities** (PDF, Excel)
- 🔍 **Real-time Monitoring** of test sessions

### **For Developers**
- 🛡️ **Security-First** architecture with environment variables
- 🧪 **Comprehensive Testing** with automated CI/CD
- 📦 **Optimized Bundles** with tree-shaking and analysis
- 🎨 **Code Quality** with ESLint, Prettier, and TypeScript
- 🔄 **Pre-commit Hooks** for consistent code standards

## 🛠️ **Tech Stack**

- **Frontend**: React 18, TypeScript, React Router
- **Backend**: Firebase (Firestore, Authentication, Hosting)
- **Styling**: CSS3 with modern features
- **State Management**: React Context API
- **Build Tool**: Create React App with Webpack
- **Code Quality**: ESLint, Prettier, Husky
- **Testing**: Jest, React Testing Library
- **CI/CD**: GitHub Actions
- **Monitoring**: Firebase Analytics, Custom Logging

## 📋 **Prerequisites**

- **Node.js** 18+ and npm
- **Firebase Account** with project setup
- **Git** for version control
- **VS Code** (recommended) with extensions

## 🚀 **Quick Start**

### 1. **Clone and Install**
```bash
# Clone the repository
git clone https://github.com/your-username/testify.git
cd testify

# Install dependencies
npm install

# Setup pre-commit hooks
npm run prepare
```

### 2. **Environment Setup**
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your Firebase configuration
# See ENVIRONMENT_SETUP.md for detailed instructions
```

### 3. **Development**
```bash
# Start development server
npm start

# Run tests
npm test

# Check code quality
npm run lint
npm run format:check
npm run type-check
```

### 4. **Production Build**
```bash
# Build for production
npm run build

# Analyze bundle size
npm run analyze

# Security audit
npm run security:check
```

## 📚 **Available Scripts**

### **Development**
- `npm start` - Start development server
- `npm test` - Run tests in watch mode
- `npm run build` - Build for production

### **Code Quality**
- `npm run lint` - Check ESLint rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check formatting
- `npm run type-check` - TypeScript validation

### **Security & Performance**
- `npm run audit` - Security vulnerability check
- `npm run audit:fix` - Auto-fix vulnerabilities
- `npm run security:check` - Comprehensive security audit
- `npm run analyze` - Bundle size analysis

### **Maintenance**
- `npm run pre-commit` - Run all pre-commit checks
- `npm outdated` - Check for dependency updates

## 🏗️ **Project Structure**

```
testify/
├── public/                 # Static assets
├── src/
│   ├── components/        # React components
│   │   ├── Dashboard/     # Admin/User dashboards
│   │   ├── TestRunner/    # Test execution interface
│   │   └── ...           # Other components
│   ├── context/          # React Context providers
│   ├── utils/            # Utility functions
│   │   ├── logger.js     # Structured logging
│   │   ├── notifications.js # User notifications
│   │   └── dateUtils.js  # Date formatting
│   ├── config/           # Configuration files
│   └── firebase.js       # Firebase initialization
├── .github/workflows/    # CI/CD pipelines
├── docs/                 # Documentation
└── scripts/              # Build and utility scripts
```

## 🔧 **Configuration**

### **Environment Variables**
See [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md) for detailed configuration.

**Required Variables:**
```env
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
# ... other Firebase config
REACT_APP_SUPER_ADMIN_EMAIL=admin@example.com
```

### **Code Quality**
See [LINTING_GUIDE.md](LINTING_GUIDE.md) for standards and setup.

## 🧪 **Testing**

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- TestRunner.test.js
```

## 🚀 **Deployment**

### **Automatic Deployment**
Push to `main` branch triggers automatic deployment via GitHub Actions.

### **Manual Deployment**
```bash
# Build and deploy to Firebase
npm run build
firebase deploy
```

### **Environment-Specific Builds**
```bash
# Production build
NODE_ENV=production npm run build

# Staging build
NODE_ENV=staging npm run build
```

## 🔒 **Security**

### **Security Features**
- 🔐 **Environment Variables** for all sensitive data
- 🛡️ **Firebase Security Rules** for data protection
- 🔍 **Real-time Monitoring** for suspicious activities
- 🚫 **Anti-cheat Measures** with tab switching detection
- 📊 **Audit Logging** for all admin actions

### **Security Audits**
```bash
# Run security audit
npm run security:check

# Fix vulnerabilities
npm run audit:fix
```

## 📊 **Performance**

### **Bundle Analysis**
```bash
# Analyze bundle size
npm run analyze

# Build with source maps
npm run build:analyze
```

### **Performance Features**
- ⚡ **Code Splitting** for optimal loading
- 🗜️ **Tree Shaking** to eliminate unused code
- 📦 **Optimized Imports** for smaller bundles
- 🔄 **Lazy Loading** for better performance

## 🤝 **Contributing**

### **Development Workflow**
1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Make** your changes following our code standards
4. **Commit** with conventional format (`feat: add amazing feature`)
5. **Push** to your branch (`git push origin feature/amazing-feature`)
6. **Open** a Pull Request

### **Code Standards**
- ✅ **ESLint** rules must pass
- ✅ **Prettier** formatting required
- ✅ **TypeScript** type checking
- ✅ **Tests** for new features
- ✅ **Documentation** updates

### **Commit Message Format**
```
type(scope): description

feat(auth): add user login functionality
fix(ui): resolve button alignment issue
docs(readme): update installation instructions
```

## 📖 **Documentation**

- 📋 [Environment Setup](ENVIRONMENT_SETUP.md)
- 🎨 [Code Quality & Linting](LINTING_GUIDE.md)
- 🤝 [Contributing Guidelines](CONTRIBUTING.md)
- 🔒 [Security & Performance](docs/SECURITY.md)

## 🐛 **Troubleshooting**

### **Common Issues**

**Firebase Configuration Error**
```bash
# Check environment variables
echo $REACT_APP_FIREBASE_API_KEY

# Verify .env file exists
ls -la .env
```

**Build Failures**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**ESLint Errors**
```bash
# Auto-fix common issues
npm run lint:fix

# Check specific file
npm run lint src/components/TestRunner/TestRunner.js
```

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 **Acknowledgments**

- **React Team** for the amazing framework
- **Firebase** for backend infrastructure
- **Create React App** for the build tooling
- **Open Source Community** for the tools and libraries

## 📞 **Support**

- 📧 **Email**: support@testify.com
- 💬 **Issues**: [GitHub Issues](https://github.com/your-username/testify/issues)
- 📚 **Wiki**: [Project Wiki](https://github.com/your-username/testify/wiki)

---

**Built with ❤️ by the Testify Team**
