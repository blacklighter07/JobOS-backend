const express = require("express");
const router = express.Router();

// Mock dashboard data
const mockDashboardStats = {
  totalApplications: 12,
  applicationsByStatus: {
    'pending': 5,
    'interview': 3,
    'rejected': 3,
    'offer': 1
  },
  thisWeekApplications: 4,
  responseRate: 33,
  averageMatchScore: 78
};

// Get dashboard statistics
router.get("/stats", async (req, res) => {
  try {
    // In a real implementation, you would fetch user-specific data from database
    const userId = req.user?.id || 'demo-user';
    
    res.json({
      success: true,
      data: mockDashboardStats
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard statistics'
    });
  }
});

// Get recent activity
router.get("/activity", async (req, res) => {
  try {
    const userId = req.user?.id || 'demo-user';
    
    const mockActivity = [
      {
        id: '1',
        type: 'application_submitted',
        title: 'Applied to Software Engineer at TechCorp',
        description: 'Your application was automatically submitted',
        timestamp: new Date().toISOString(),
        status: 'success'
      },
      {
        id: '2',
        type: 'resume_optimized',
        title: 'Resume optimized for Frontend Developer role',
        description: 'AI improved your resume with 5 key optimizations',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        status: 'success'
      },
      {
        id: '3',
        type: 'interview_scheduled',
        title: 'Interview scheduled with StartupCo',
        description: 'Video interview on Friday at 2:00 PM',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        status: 'info'
      }
    ];
    
    res.json({
      success: true,
      data: mockActivity
    });

  } catch (error) {
    console.error('Dashboard activity error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recent activity'
    });
  }
});

module.exports = router; 