// Copyright 2026 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

import React from "react";
import {Button, Card, Col, Row} from "antd";
import {
  ApiOutlined,
  CloudOutlined,
  LogoutOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ShoppingOutlined,
} from "@ant-design/icons";
import {Redirect, withRouter} from "react-router-dom";
import i18next from "i18next";
import * as AuthBackend from "./AuthBackend";

const SYSTEMS = [
  {key: "cloud", name: "云管理平台", url: "https://orange-wave-09002e800.7.azurestaticapps.net/", icon: CloudOutlined, color: "#1677ff"},
  {key: "ticket", name: "工单系统", url: "https://kind-forest-0138c3300.6.azurestaticapps.net/", icon: ApiOutlined, color: "#13c2c2"},
  {key: "ai", name: "AI 大脑", url: "https://socp-test.victorioussand-69befc84.southeastasia.azurecontainerapps.io/", icon: RobotOutlined, color: "#722ed1"},
  {key: "sales", name: "销售系统", url: "https://purple-rock-072562e00.7.azurestaticapps.net/login", icon: ShoppingOutlined, color: "#eb2f96"},
  {key: "auth", name: "统一认证后台", url: "/", icon: SafetyCertificateOutlined, color: "#52c41a"},
];

class SystemPickerPage extends React.Component {
  buildTargetUrl(system) {
    if (system.url.startsWith("/")) {return system.url;}
    const params = new URLSearchParams();
    const account = this.props.account;
    const token = this.props.accessToken;
    if (token) {params.set("access_token", token);}
    if (account?.name) {params.set("username", account.name);}
    if (account?.owner) {params.set("owner", account.owner);}
    const qs = params.toString();
    if (!qs) {return system.url;}
    return system.url + (system.url.includes("?") ? "&" : "?") + qs;
  }

  go(system) {
    const target = this.buildTargetUrl(system);
    if (target.startsWith("/")) {
      this.props.history.push(target);
    } else {
      window.location.href = target;
    }
  }

  logout = () => {
    AuthBackend.logout().then(() => {
      this.props.onUpdateAccount?.(null);
      window.location.href = "/login";
    });
  };

  render() {
    if (!this.props.account) {
      return <Redirect to="/login" />;
    }

    const wrapperStyle = {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      width: "100%",
    };

    const cardContainerStyle = {
      width: "100%",
      maxWidth: "960px",
      padding: "40px 48px",
      background: "rgba(255, 255, 255, 0.18)",
      backdropFilter: "blur(18px) saturate(140%)",
      WebkitBackdropFilter: "blur(18px) saturate(140%)",
      border: "1px solid rgba(255, 255, 255, 0.35)",
      borderRadius: "16px",
      boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35)",
      color: "#fff",
    };

    const titleStyle = {
      textAlign: "center",
      marginBottom: "8px",
      color: "#fff",
      fontSize: "26px",
      fontWeight: 700,
      letterSpacing: "4px",
      textShadow: "0 2px 8px rgba(0,0,0,0.45)",
    };

    const subtitleStyle = {
      textAlign: "center",
      marginBottom: "28px",
      color: "rgba(255,255,255,0.85)",
      fontSize: "14px",
      textShadow: "0 1px 4px rgba(0,0,0,0.45)",
    };

    const cardInnerStyle = {
      textAlign: "center",
      cursor: "pointer",
      borderRadius: "12px",
      background: "rgba(255,255,255,0.85)",
      border: "none",
    };

    return (
      <div style={wrapperStyle}>
        <div style={cardContainerStyle}>
          <div style={titleStyle}>认证中心</div>
          <div style={subtitleStyle}>
            {i18next.t("login:Welcome")}, {this.props.account.displayName || this.props.account.name}
          </div>
          <Row gutter={[20, 20]} justify="center">
            {SYSTEMS.map(sys => {
              const Icon = sys.icon;
              return (
                <Col xs={24} sm={12} md={8} key={sys.key}>
                  <Card
                    hoverable
                    style={cardInnerStyle}
                    bodyStyle={{padding: "28px 16px"}}
                    onClick={() => this.go(sys)}
                  >
                    <Icon style={{fontSize: "40px", color: sys.color, marginBottom: "12px"}} />
                    <div style={{fontSize: "16px", fontWeight: 600, color: "#1f1f1f"}}>{sys.name}</div>
                  </Card>
                </Col>
              );
            })}
          </Row>
          <div style={{textAlign: "center", marginTop: "28px"}}>
            <Button
              icon={<LogoutOutlined />}
              onClick={this.logout}
              style={{background: "rgba(255,255,255,0.85)", border: "none"}}
            >
              {i18next.t("account:Logout")}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default withRouter(SystemPickerPage);
