import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Target, Eye, History, Rocket, Ban, Code, Users, Trophy } from 'lucide-react';

export default function AboutPage() {
  const timeline = [
    { year: '2022', title: 'Club Founded', description: 'code.scriet was established with 20 founding members' },
    { year: '2023', title: 'First Hackathon', description: 'Organized our first successful 24-hour hackathon' },
    { year: '2023', title: '500+ Members', description: 'Reached a milestone of 500 active members' },
    { year: '2024', title: 'Expanding', description: 'Launching new initiatives and growing our community' },
  ];

  const focusAreas = [
    { icon: Code, title: 'Data Structures & Algorithms', description: 'Master the fundamentals through practice and peer learning' },
    { icon: Users, title: 'Collaborative Projects', description: 'Build real-world applications together as a team' },
    { icon: Trophy, title: 'Competitive Programming', description: 'Participate in contests and sharpen your skills' },
    { icon: Rocket, title: 'Career Development', description: 'Prepare for technical interviews and career growth' },
  ];

  const notAboutUs = [
    'A pay-to-win certification mill',
    'A one-size-fits-all learning path',
    'A competitive environment that discourages beginners',
    'A club that values quantity over quality',
  ];

  return (
    <Layout>
      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-900 text-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <h1 className="text-5xl md:text-6xl font-bold mb-6">About code.scriet</h1>
            <p className="text-xl text-amber-50">
              Building tomorrow's problem solvers through community, collaboration, and continuous learning
            </p>
          </motion.div>
        </div>
      </section>

      {/* Vision & Mission */}
      <section className="py-20 bg-amber-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <Card className="h-full bg-gradient-to-br from-amber-100 to-orange-50 border-amber-200">
                <CardContent className="p-8">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-6">
                    <Eye className="h-8 w-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-amber-900 mb-4">Our Vision</h2>
                  <p className="text-gray-700 text-lg">
                    To create a thriving community of problem solvers who are equipped with the skills and mindset to tackle any technical challenge and make a positive impact in the tech industry.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <Card className="h-full bg-gradient-to-br from-amber-100 to-orange-50 border-amber-200">
                <CardContent className="p-8">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-6">
                    <Target className="h-8 w-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-amber-900 mb-4">Our Mission</h2>
                  <p className="text-gray-700 text-lg">
                    To provide a supportive platform for students to learn, practice, and excel in programming through hands-on workshops, collaborative projects, and mentorship opportunities.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* What We Do */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-amber-900 mb-4">What We Do</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Our focus areas are designed to help members grow as developers and problem solvers
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {focusAreas.map((area, index) => (
              <motion.div
                key={area.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="h-full hover:shadow-lg transition-all duration-300">
                  <CardContent className="p-6 text-center">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 mb-4">
                      <area.icon className="h-7 w-7 text-amber-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-amber-900 mb-2">{area.title}</h3>
                    <p className="text-gray-600 text-sm">{area.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-20 bg-amber-50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-4">
              <History className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-4xl font-bold text-amber-900 mb-4">Our Journey</h2>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            {timeline.map((item, index) => (
              <motion.div
                key={item.year + item.title}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="flex gap-4 mb-8"
              >
                <div className="flex-shrink-0 w-20 text-right">
                  <span className="inline-block px-3 py-1 rounded-full bg-amber-400 text-white font-bold text-sm">
                    {item.year}
                  </span>
                </div>
                <div className="flex-shrink-0 w-4 flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  {index < timeline.length - 1 && (
                    <div className="w-0.5 flex-1 bg-amber-300 mt-1"></div>
                  )}
                </div>
                <div className="pb-8">
                  <h3 className="font-semibold text-amber-900 text-lg">{item.title}</h3>
                  <p className="text-gray-600">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What We're NOT */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-4">
              <Ban className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-4xl font-bold text-amber-900 mb-4">What We're NOT</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Setting the right expectations from the start
            </p>
          </motion.div>

          <div className="max-w-2xl mx-auto">
            {notAboutUs.map((item, index) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="flex items-center gap-4 mb-4 p-4 rounded-lg bg-red-50 border border-red-100"
              >
                <Ban className="h-5 w-5 text-red-500 flex-shrink-0" />
                <span className="text-gray-700">{item}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section className="py-20 bg-gradient-to-br from-amber-900 to-amber-950 text-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-400 mb-4">
              <Rocket className="h-8 w-8 text-amber-900" />
            </div>
            <h2 className="text-4xl font-bold mb-4">Our Roadmap</h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { phase: 'Phase 1', title: 'Foundation', items: ['Weekly DSA sessions', 'Monthly workshops', 'Community building'] },
              { phase: 'Phase 2', title: 'Growth', items: ['Industry partnerships', 'Hackathon series', 'Mentorship program'] },
              { phase: 'Phase 3', title: 'Scale', items: ['Contest platform', 'Alumni network', 'Internship partnerships'] },
            ].map((phase, index) => (
              <motion.div
                key={phase.phase}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                viewport={{ once: true }}
                className="bg-amber-900/50 rounded-xl p-6 backdrop-blur-sm"
              >
                <span className="inline-block px-3 py-1 rounded-full bg-amber-400 text-amber-900 font-bold text-sm mb-4">
                  {phase.phase}
                </span>
                <h3 className="text-xl font-bold mb-4">{phase.title}</h3>
                <ul className="space-y-2">
                  {phase.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-amber-100">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
