const mongoose = require('mongoose');
const Resume = require('../models/Resume');
const User = require('../../services/authentication/userModel');

// Get dashboard statistics focused on resume functionality
const getDashboardStats = async (req, res) => {
  try {
    const userId = req.userId;

    // Ensure userId is valid
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    // Get total resumes
    const totalResumes = await Resume.countDocuments({ userId }) || 0;

    // Get resume versions count
    const resumeVersions = await Resume.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $project: { versionsCount: { $size: { $ifNull: ['$versions', []] } } } },
      { $group: { _id: null, totalVersions: { $sum: '$versionsCount' } } }
    ]);
    const totalVersions = resumeVersions.length > 0 ? resumeVersions[0].totalVersions : 0;

    // Get this week's resume activity
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const thisWeekResumes = await Resume.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      updatedAt: { $gte: oneWeekAgo }
    }) || 0;

    // Get average optimization score
    const optimizationScores = await Resume.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(userId), 
          optimizationScore: { $exists: true, $ne: null, $gte: 0 } 
        } 
      },
      { $group: { _id: null, avgScore: { $avg: '$optimizationScore' } } }
    ]);
    const averageOptimizationScore = optimizationScores.length > 0 ? Math.round(optimizationScores[0].avgScore) : 0;

    // Get resume formats distribution
    const resumesByFormat = await Resume.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$format', count: { $sum: 1 } } },
      { $project: { format: '$_id', count: 1, _id: 0 } }
    ]);

    // Convert to object format
    const formatCounts = {};
    resumesByFormat.forEach(item => {
      if (item.format) {
        formatCounts[item.format] = item.count;
      }
    });

    res.json({
      success: true,
      data: {
        totalResumes,
        totalVersions,
        thisWeekActivity: thisWeekResumes,
        averageOptimizationScore,
        resumesByFormat: formatCounts
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
      details: error.message
    });
  }
};

module.exports = {
  getDashboardStats
}; 