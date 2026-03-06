// AWS Architecture Icons as SVG path data for d3.js topology rendering.
// Each icon is designed for 40x40 viewBox, rendered as d3 symbols.

const AWS_TOPO_ICONS = {
  // EC2 Instance (server box)
  ec2: {
    color: '#ED7100',
    path: 'M8 4h24v32H8V4zm2 2v28h20V6H10zm4 4h12v2H14v-2zm0 6h12v2H14v-2zm0 6h12v2H14v-2z',
    label: 'EC2'
  },
  // VPC (cloud boundary)
  vpc: {
    color: '#8C4FFF',
    path: 'M20 4c-7.7 0-14 5.4-14 12 0 3.2 1.6 6.2 4.2 8.4L8 36h24l-2.2-11.6C32.4 22.2 34 19.2 34 16c0-6.6-6.3-12-14-12zm0 4c5.5 0 10 3.6 10 8s-4.5 8-10 8-10-3.6-10-8 4.5-8 10-8z',
    label: 'VPC'
  },
  // Subnet
  subnet: {
    color: '#248814',
    path: 'M6 8h28v24H6V8zm2 2v20h24V10H8zm4 4h16v2H12v-2zm0 6h16v2H12v-2z',
    label: 'Subnet'
  },
  // Security Group (shield)
  sg: {
    color: '#DD344C',
    path: 'M20 4L6 10v10c0 9.2 6 17.2 14 20 8-2.8 14-10.8 14-20V10L20 4zm0 4l10 4.4v7.6c0 7-4.6 13.2-10 15.6-5.4-2.4-10-8.6-10-15.6v-7.6L20 8z',
    label: 'SG'
  },
  // Internet Gateway
  igw: {
    color: '#8C4FFF',
    path: 'M20 2l-4 4h3v8h-8l-4-4v3H2v2h5v3l4-4h8v8l-4 4h3v5h2v-5h3l-4-4v-8h8l4 4v-3h5v-2h-5v-3l-4 4h-8V6h3l-4-4z',
    label: 'IGW'
  },
  // NAT Gateway
  nat: {
    color: '#248814',
    path: 'M20 2C10 2 2 10 2 20s8 18 18 18 18-8 18-18S30 2 20 2zm0 4c7.7 0 14 6.3 14 14s-6.3 14-14 14S6 27.7 6 20 12.3 6 20 6zm-4 8v4h-4l6 8 6-8h-4v-4h-4z',
    label: 'NAT'
  },
  // Transit Gateway
  tgw: {
    color: '#8C4FFF',
    path: 'M20 2C10 2 2 10 2 20s8 18 18 18 18-8 18-18S30 2 20 2zm0 4c7.7 0 14 6.3 14 14s-6.3 14-14 14S6 27.7 6 20 12.3 6 20 6zm-1 6v6h-6v2h6v6h2v-6h6v-2h-6v-6h-2z',
    label: 'TGW'
  },
  // VPC Peering
  peering: {
    color: '#8C4FFF',
    path: 'M10 14a6 6 0 110 12 6 6 0 010-12zm20 0a6 6 0 110 12 6 6 0 010-12zM16 20h8',
    label: 'Peering'
  },
  // VPC Endpoint
  endpoint: {
    color: '#8C4FFF',
    path: 'M20 2C10 2 2 10 2 20s8 18 18 18 18-8 18-18S30 2 20 2zm0 4c7.7 0 14 6.3 14 14s-6.3 14-14 14S6 27.7 6 20 12.3 6 20 6zm-6 10h12v4l6-6-6-6v4H14v4z',
    label: 'VPCE'
  },
  // Load Balancer (ELB)
  elb: {
    color: '#8C4FFF',
    path: 'M20 2C10 2 2 10 2 20s8 18 18 18 18-8 18-18S30 2 20 2zm0 32c-7.7 0-14-6.3-14-14S12.3 6 20 6s14 6.3 14 14-6.3 14-14 14zm-8-18h4v12h-4V16zm6 0h4v12h-4V16zm6 0h4v12h-4V16z',
    label: 'ELB'
  },
  // Route Table
  routeTable: {
    color: '#248814',
    path: 'M6 6h28v28H6V6zm2 2v24h24V8H8zm4 4h16v2H12v-2zm0 5h16v2H12v-2zm0 5h16v2H12v-2zm0 5h16v2H12v-2z',
    label: 'RT'
  },
  // Network ACL
  nacl: {
    color: '#DD344C',
    path: 'M6 6h28v28H6V6zm2 2v24h24V8H8zm4 4h6v2h-6v-2zm10 0h6v2h-6v-2zm-10 5h6v2h-6v-2zm10 0h6v2h-6v-2zm-10 5h6v2h-6v-2zm10 0h6v2h-6v-2z',
    label: 'NACL'
  },
  // ENI (Network Interface)
  eni: {
    color: '#ED7100',
    path: 'M14 8h12v24H14V8zm2 2v20h8V10h-8zm-8 4h6v2H8v-2zm0 6h6v2H8v-2zm0 6h6v2H8v-2zm24-12h-6v2h6v-2zm0 6h-6v2h6v-2zm0 6h-6v2h6v-2z',
    label: 'ENI'
  }
};
